// LarpBattle — сигналинг и матчмейкинг (этап 3, ТЗ §9/§10).
// Node.js + WebSocket: очередь с подбором по ELO, приватные комнаты по коду,
// ретрансляция WebRTC-сигналов, синхронизация счёта, тех. победа при дисконнекте.
import { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 8787
const ROUND_MS = 20_000 // длительность раунда — параметр (ТЗ §3)
const VS_LEAD_MS = 6_500 // заставка VS + отсчёт 3-2-1 до старта
const FINALIZE_MS = 2_000 // грейс на долетающие распознавания после конца раунда
const BASE_ELO_WINDOW = 150 // ТЗ §6.4
const WINDOW_GROWTH_PER_10S = 100

const wss = new WebSocketServer({ port: PORT })
const queue = [] // { ws, since }
const rooms = new Map() // roomId -> room

const send = (ws, type, payload = {}) => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }))
}
const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase()

function makeRoom({ players, friendly }) {
  const id = roomCode()
  const room = {
    id,
    friendly,
    state: 'signaling', // signaling | live | done
    players: players.map((p) => ({ ws: p, ready: false, score: 0, items: [] })),
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
      polite: i === 0, // роли для perfect negotiation
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
    send(p.ws, 'battle_start', {
      startAt: room.startAt,
      durationMs: ROUND_MS,
      serverNow: Date.now(),
    })
  }
  room.endTimer = setTimeout(() => endBattle(room, 'time'), VS_LEAD_MS + ROUND_MS + FINALIZE_MS)
}

function endBattle(room, reason, loserWs = null) {
  if (room.state === 'done') return
  room.state = 'done'
  clearTimeout(room.endTimer)
  const [a, b] = room.players
  for (const [me, opp] of [[a, b], [b, a]]) {
    let outcome // 'win' | 'loss' | 'draw'
    if (reason === 'time') outcome = me.score > opp.score ? 'win' : me.score < opp.score ? 'loss' : 'draw'
    else outcome = me.ws === loserWs ? 'loss' : 'win'
    send(me.ws, 'battle_end', {
      reason, // time | surrender | disconnect
      outcome,
      technical: reason !== 'time',
      myScore: me.score,
      oppScore: opp.score,
    })
    me.ws.meta.roomId = null
  }
  rooms.delete(room.id)
  console.log(`[room ${room.id}] end: ${reason}, ${a.score} vs ${b.score}`)
}

function playerOf(room, ws) {
  return room.players.find((p) => p.ws === ws)
}
function opponentOf(room, ws) {
  return room.players.find((p) => p.ws !== ws)
}

// Матчмейкинг: пары из очереди, окно ELO расширяется со временем ожидания
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
  ws.meta = { nick: 'anon', elo: 1000, roomId: null }

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    const room = ws.meta.roomId ? rooms.get(ws.meta.roomId) : null

    switch (msg.type) {
      case 'hello':
        ws.meta.nick = String(msg.nick || 'anon').slice(0, 24)
        ws.meta.elo = Number(msg.elo) || 1000
        break

      case 'find_match':
        if (!queue.some((e) => e.ws === ws) && !ws.meta.roomId) queue.push({ ws, since: Date.now() })
        break

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
        rooms.delete(target.id) // пересоздаётся как боевая комната с тем же кодом
        makeRoom({ players: [target.host, ws], friendly: true })
        break
      }

      // WebRTC-сигналы просто ретранслируются сопернику
      case 'signal':
        if (room?.players) send(opponentOf(room, ws).ws, 'signal', { data: msg.data })
        break

      case 'ready': {
        if (!room?.players || room.state !== 'signaling') break
        playerOf(room, ws).ready = true
        if (room.players.every((p) => p.ready)) startBattle(room)
        break
      }

      // Распознанный айтем: учитываем в счёте (если засчитан) и шлём сопернику
      case 'item': {
        if (!room?.players || room.state !== 'live') break
        const me = playerOf(room, ws)
        const item = {
          name: String(msg.item?.name || '').slice(0, 120),
          category: String(msg.item?.category || 'other'),
          price: Math.max(0, Math.round(Number(msg.item?.price) || 0)),
          confidence: Number(msg.item?.confidence) || 0,
        }
        const flag = msg.flag ? String(msg.flag) : null
        me.items.push({ item, flag })
        if (!flag) me.score += item.price
        send(opponentOf(room, ws).ws, 'opp_item', { item, flag, reason: msg.reason || null })
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
    if (room.state === 'waiting') rooms.delete(room.id) // хост инвайт-комнаты ушёл
    else if (room.state !== 'done') endBattle(room, 'disconnect', ws) // ТЗ §6.5: дисконнект = тех. поражение
  })
})

console.log(`LarpBattle signaling on ws://0.0.0.0:${PORT} (round ${ROUND_MS / 1000}s)`)
