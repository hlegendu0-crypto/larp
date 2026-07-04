// LarpBattle — бэкенд этапов 3–4 (ТЗ §9/§10).
// HTTP API (аккаунты, лидерборд, админка) + WebSocket (матчмейкинг, WebRTC-сигналинг,
// авторитетный счёт, античит-база pHash, репорты) на одном порту.
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import {
  getTokenSecret, findPlayerByEmail, findPlayerByNick, findPlayerById, createPlayer,
  applyBattleResult, setBan, leaderboard, listPlayers, insertMatch, battlesToday,
  recentItems, insertSeenItem, insertReport, listReports, resolveReport,
} from './db.js'
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js'

const PORT = process.env.PORT || 8787
const ROUND_MS = Number(process.env.ROUND_MS || 20_000) // длительность раунда — параметр (ТЗ §3)
const VS_LEAD_MS = Number(process.env.VS_LEAD_MS || 6_500)
const FINALIZE_MS = Number(process.env.FINALIZE_MS || 2_000)
const BASE_ELO_WINDOW = 150 // ТЗ §6.4
const WINDOW_GROWTH_PER_10S = 100
const DAILY_BATTLE_LIMIT = Number(process.env.DAILY_BATTLE_LIMIT || 30) // ТЗ §11
const REPEAT_WINDOW_DAYS = 7 // ТЗ §7.4
const REPEAT_HASH_DISTANCE = 25 // порог хэмминга для 256-битного dHash
const ELO_K = 32 // ТЗ §8
const ELO_K_TECH = 16
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-dev-key'

const SECRET = getTokenSecret()
const normName = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function hamming(hexA, hexB) {
  try {
    let x = BigInt('0x' + hexA) ^ BigInt('0x' + hexB)
    let n = 0
    while (x) {
      n += Number(x & 1n)
      x >>= 1n
    }
    return n
  } catch {
    return Infinity
  }
}

const publicProfile = (p) => ({ nick: p.nick, email: p.email, elo: p.elo, wins: p.wins, losses: p.losses })

// ---------- HTTP API ----------
const readBody = (req) =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })

const httpServer = createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, x-admin-key',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    })
    res.end(JSON.stringify(obj))
  }
  if (req.method === 'OPTIONS') return send(204, {})
  const url = new URL(req.url, 'http://x')
  const path = url.pathname

  const authPlayer = () => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
    const payload = m && verifyToken(SECRET, m[1])
    return payload ? findPlayerById(payload.id) : null
  }
  const isAdmin = () => req.headers['x-admin-key'] === ADMIN_KEY

  try {
    if (path === '/api/health') return send(200, { ok: true })

    if (path === '/api/register' && req.method === 'POST') {
      const { nick, email, password } = await readBody(req)
      if (!nick || nick.trim().length < 3) return send(400, { error: 'Ник — минимум 3 символа' })
      if (!/^\S+@\S+\.\S+$/.test(email || '')) return send(400, { error: 'Некорректный email' })
      if (!password || password.length < 6) return send(400, { error: 'Пароль — минимум 6 символов' })
      if (findPlayerByNick(nick.trim())) return send(409, { error: 'Ник уже занят' })
      if (findPlayerByEmail(email)) return send(409, { error: 'Email уже зарегистрирован' })
      const { hash, salt } = hashPassword(password)
      const p = createPlayer({ nick: nick.trim(), email: email.trim(), passHash: hash, salt })
      return send(200, { token: signToken(SECRET, { id: p.id }), profile: publicProfile(p) })
    }

    if (path === '/api/login' && req.method === 'POST') {
      const { email, password } = await readBody(req)
      const p = findPlayerByEmail(String(email || ''))
      if (!p || !verifyPassword(String(password || ''), p.salt, p.pass_hash))
        return send(401, { error: 'Неверный email или пароль' })
      if (p.banned) return send(403, { error: `Аккаунт заблокирован${p.ban_reason ? `: ${p.ban_reason}` : ''}` })
      return send(200, { token: signToken(SECRET, { id: p.id }), profile: publicProfile(p) })
    }

    if (path === '/api/me') {
      const p = authPlayer()
      if (!p) return send(401, { error: 'Не авторизован' })
      return send(200, { profile: publicProfile(p), banned: !!p.banned, battlesToday: battlesToday(p.id), dailyLimit: DAILY_BATTLE_LIMIT })
    }

    if (path === '/api/leaderboard') return send(200, { players: leaderboard(50) })

    // --- админка модерации (ТЗ §4, §7.4) ---
    if (path.startsWith('/api/admin/')) {
      if (!isAdmin()) return send(403, { error: 'Неверный ключ администратора' })
      if (path === '/api/admin/reports') return send(200, { reports: listReports() })
      if (path === '/api/admin/players') return send(200, { players: listPlayers() })
      if (path === '/api/admin/resolve' && req.method === 'POST') {
        const { id } = await readBody(req)
        resolveReport(Number(id))
        return send(200, { ok: true })
      }
      if (path === '/api/admin/ban' && req.method === 'POST') {
        const { nick, banned, reason } = await readBody(req)
        setBan(String(nick), !!banned, reason || null)
        return send(200, { ok: true })
      }
    }

    return send(404, { error: 'not found' })
  } catch (e) {
    console.error('http error:', e)
    return send(500, { error: 'server error' })
  }
})

// ---------- WebSocket: матчмейкинг и бой ----------
const wss = new WebSocketServer({ server: httpServer })
const queue = []
const rooms = new Map()

const send = (ws, type, payload = {}) => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }))
}
const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase()

function makeRoom({ players, friendly }) {
  const id = roomCode()
  const room = {
    id,
    friendly,
    state: 'signaling',
    players: players.map((p) => ({ ws: p, ready: false, score: 0, items: [], nsfw: false })),
    startAt: null,
    endTimer: null,
  }
  rooms.set(id, room)
  room.players.forEach((p, i) => {
    p.ws.meta.roomId = id
    const opp = room.players[1 - i].ws.meta
    send(p.ws, 'match_found', {
      roomId: id,
      friendly,
      polite: i === 0,
      opponent: { nick: opp.nick, elo: opp.elo },
    })
  })
  console.log(`[room ${id}] ${room.players.map((p) => p.ws.meta.nick).join(' vs ')}${friendly ? ' (friendly)' : ''}`)
  return room
}

function startBattle(room) {
  room.state = 'live'
  room.startAt = Date.now() + VS_LEAD_MS
  for (const p of room.players) {
    send(p.ws, 'battle_start', { startAt: room.startAt, durationMs: ROUND_MS, serverNow: Date.now() })
  }
  room.endTimer = setTimeout(() => endBattle(room, 'time'), VS_LEAD_MS + ROUND_MS + FINALIZE_MS)
}

function endBattle(room, reason, loserWs = null) {
  if (room.state === 'done') return
  room.state = 'done'
  clearTimeout(room.endTimer)
  const [a, b] = room.players

  // ELO на сервере (§8): только рейтинговые матчи между аккаунтами
  const ranked = !room.friendly && a.ws.meta.account && b.ws.meta.account
  const deltas = new Map()
  if (ranked) {
    const K = reason === 'time' ? ELO_K : ELO_K_TECH
    for (const [me, opp] of [[a, b], [b, a]]) {
      const S =
        reason === 'time'
          ? me.score > opp.score ? 1 : me.score < opp.score ? 0 : 0.5
          : me.ws === loserWs ? 0 : 1
      const E = 1 / (1 + Math.pow(10, (opp.ws.meta.elo - me.ws.meta.elo) / 400))
      deltas.set(me, Math.round(K * (S - E)))
    }
    for (const p of room.players) {
      const won = reason === 'time' ? p.score > (p === a ? b : a).score : p.ws !== loserWs
      const updated = applyBattleResult(p.ws.meta.account.id, { deltaElo: deltas.get(p), won })
      p.newElo = updated.elo
    }
    // Пополняем античит-базу засчитанными айтемами (§7.4)
    for (const p of room.players) {
      for (const it of p.items) {
        if (!it.flag) insertSeenItem(p.ws.meta.account.id, { nameNorm: normName(it.item.name), phash: it.phash, price: it.item.price })
      }
    }
  }
  if (a.ws.meta.account && b.ws.meta.account) {
    const winner =
      reason === 'time'
        ? a.score > b.score ? a : b.score > a.score ? b : null
        : room.players.find((p) => p.ws !== loserWs)
    insertMatch({
      room: room.id,
      aId: a.ws.meta.account.id,
      bId: b.ws.meta.account.id,
      aScore: a.score,
      bScore: b.score,
      reason,
      winnerId: winner ? winner.ws.meta.account.id : null,
      friendly: room.friendly,
    })
  }

  for (const [me, opp] of [[a, b], [b, a]]) {
    let outcome
    if (reason === 'time') outcome = me.score > opp.score ? 'win' : me.score < opp.score ? 'loss' : 'draw'
    else outcome = me.ws === loserWs ? 'loss' : 'win'
    send(me.ws, 'battle_end', {
      reason, // time | surrender | disconnect | nsfw
      outcome,
      technical: reason !== 'time',
      myScore: me.score,
      oppScore: opp.score,
      ...(ranked ? { eloDelta: deltas.get(me), newElo: me.newElo } : {}),
    })
    me.ws.meta.roomId = null
  }
  rooms.delete(room.id)
  console.log(`[room ${room.id}] end: ${reason}, ${a.score} vs ${b.score}`)
}

const playerOf = (room, ws) => room.players.find((p) => p.ws === ws)
const opponentOf = (room, ws) => room.players.find((p) => p.ws !== ws)

setInterval(() => {
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const A = queue[i], B = queue[j]
      const win = (e) => BASE_ELO_WINDOW + WINDOW_GROWTH_PER_10S * Math.floor((Date.now() - e.since) / 10_000)
      const diff = Math.abs(A.ws.meta.elo - B.ws.meta.elo)
      if (diff <= win(A) && diff <= win(B)) {
        queue.splice(j, 1)
        queue.splice(i, 1)
        makeRoom({ players: [A.ws, B.ws], friendly: false })
        i--
        break
      }
    }
  }
}, 1500)

const dropFromQueue = (ws) => {
  const idx = queue.findIndex((e) => e.ws === ws)
  if (idx >= 0) queue.splice(idx, 1)
}

wss.on('connection', (ws) => {
  ws.meta = { nick: 'anon', elo: 1000, roomId: null, account: null }

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    const room = ws.meta.roomId ? rooms.get(ws.meta.roomId) : null

    switch (msg.type) {
      case 'hello': {
        ws.meta.nick = String(msg.nick || 'anon').slice(0, 24)
        ws.meta.elo = Number(msg.elo) || 1000
        // Аккаунт (этап 4): токен на сокете — ник/ELO берём из базы
        const payload = msg.token && verifyToken(SECRET, msg.token)
        const acc = payload && findPlayerById(payload.id)
        if (acc && !acc.banned) {
          ws.meta.account = acc
          ws.meta.nick = acc.nick
          ws.meta.elo = acc.elo
        }
        break
      }

      case 'find_match': {
        // Рейтинговая очередь — только для аккаунтов (этап 4)
        if (!ws.meta.account) {
          send(ws, 'queue_denied', { message: 'Для рейтинговых матчей нужен аккаунт. Войдите через email.' })
          break
        }
        if (ws.meta.account.banned) {
          send(ws, 'queue_denied', { message: 'Аккаунт заблокирован.' })
          break
        }
        if (battlesToday(ws.meta.account.id) >= DAILY_BATTLE_LIMIT) {
          send(ws, 'queue_denied', { message: `Дневной лимит баттлов (${DAILY_BATTLE_LIMIT}) исчерпан. Возвращайтесь завтра.` })
          break
        }
        if (!queue.some((e) => e.ws === ws) && !ws.meta.roomId) queue.push({ ws, since: Date.now() })
        break
      }

      case 'cancel_find':
        dropFromQueue(ws)
        break

      case 'create_room': {
        const id = roomCode()
        rooms.set(id, { id, friendly: true, state: 'waiting', host: ws, players: null })
        ws.meta.roomId = id
        send(ws, 'room_created', { code: id })
        break
      }

      case 'join_room': {
        const target = rooms.get(String(msg.code || '').toUpperCase())
        if (!target || target.state !== 'waiting' || target.host === ws) {
          send(ws, 'room_error', { message: 'Комната не найдена или уже занята' })
          break
        }
        rooms.delete(target.id)
        makeRoom({ players: [target.host, ws], friendly: true })
        break
      }

      case 'signal':
        if (room?.players) send(opponentOf(room, ws).ws, 'signal', { data: msg.data })
        break

      case 'ready': {
        if (!room?.players || room.state !== 'signaling') break
        playerOf(room, ws).ready = true
        if (room.players.every((p) => p.ready)) startBattle(room)
        break
      }

      case 'item': {
        if (!room?.players || room.state !== 'live') break
        const me = playerOf(room, ws)
        const item = {
          name: String(msg.item?.name || '').slice(0, 120),
          category: String(msg.item?.category || 'other'),
          price: Math.max(0, Math.round(Number(msg.item?.price) || 0)),
          confidence: Number(msg.item?.confidence) || 0,
        }
        let flag = msg.flag ? String(msg.flag) : null
        let reason = msg.reason || null
        const phash = typeof msg.phash === 'string' ? msg.phash.slice(0, 80) : null

        // Античит §7.4: повторный показ предмета из матчей за последние 7 дней = 0 очков
        if (!flag && ws.meta.account) {
          const nameNorm = normName(item.name)
          const seen = recentItems(ws.meta.account.id, REPEAT_WINDOW_DAYS)
          const repeat = seen.some(
            (s) =>
              s.name_norm === nameNorm ||
              (phash && s.phash && hamming(phash, s.phash) <= REPEAT_HASH_DISTANCE),
          )
          if (repeat) {
            flag = 'repeat'
            reason = 'Уже показан в недавних матчах — 0 очков'
          }
        }

        me.items.push({ item, flag, phash })
        if (!flag) me.score += item.price
        // Вердикт сервера — обеим сторонам (счёт авторитетный)
        if (msg.id) send(ws, 'item_ack', { id: msg.id, flag, reason })
        send(opponentOf(room, ws).ws, 'opp_item', { item, flag, reason })
        break
      }

      // NSFW-флаг от vision-модели (§7.5): тех. поражение + автобан до модерации
      case 'nsfw': {
        if (!room?.players || room.state !== 'live') break
        if (ws.meta.account) {
          setBan(ws.meta.nick, true, 'nsfw_auto: автостоп до разбора модерацией')
          insertReport({ reporter: 'system', reported: ws.meta.nick, room: room.id, reason: 'NSFW (автодетект vision-модели)' })
        }
        endBattle(room, 'nsfw', ws)
        break
      }

      // Кнопка репорта (§7.4): жалоба в очередь модерации
      case 'report': {
        if (!room?.players) break
        insertReport({
          reporter: ws.meta.nick,
          reported: opponentOf(room, ws).ws.meta.nick,
          room: room.id,
          reason: String(msg.reason || '').slice(0, 500) || null,
        })
        send(ws, 'report_ack', {})
        break
      }

      case 'surrender':
        if (room?.players && room.state === 'live') endBattle(room, 'surrender', ws)
        break
    }
  })

  ws.on('close', () => {
    dropFromQueue(ws)
    const room = ws.meta.roomId ? rooms.get(ws.meta.roomId) : null
    if (!room) return
    if (room.state === 'waiting') rooms.delete(room.id)
    else if (room.state !== 'done') endBattle(room, 'disconnect', ws)
  })
})

httpServer.listen(PORT, () => {
  console.log(`LarpBattle backend on :${PORT} (ws + api, round ${ROUND_MS / 1000}s, daily limit ${DAILY_BATTLE_LIMIT})`)
})
