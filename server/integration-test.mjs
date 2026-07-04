// Интеграционный тест бэкенда (этапы 3–4): npm run test:server
// Сам поднимает сервер на тестовом порту с ускоренными таймингами (раунд 3 с),
// прогоняет аккаунты, ELO, античит-базу, модерацию, NSFW и лимиты, сам гасится.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

const PORT = 8798
const API = `http://localhost:${PORT}`
const WSU = `ws://localhost:${PORT}`
const ADMIN = { 'x-admin-key': 'admin-dev-key' }

const tmp = mkdtempSync(join(tmpdir(), 'larpbattle-test-'))
const server = spawn(process.execPath, [new URL('./index.js', import.meta.url).pathname], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: join(tmp, 'test.db'),
    ROUND_MS: '3000',
    VS_LEAD_MS: '1000',
    FINALIZE_MS: '500',
    DAILY_BATTLE_LIMIT: '4',
    ADMIN_KEY: 'admin-dev-key',
  },
  stdio: 'ignore',
})
const cleanup = () => {
  server.kill()
  rmSync(tmp, { recursive: true, force: true })
}
process.on('exit', cleanup)

// ждём готовности сервера
for (let i = 0; ; i++) {
  try {
    await fetch(API + '/api/health')
    break
  } catch {
    if (i > 50) throw new Error('сервер не поднялся')
    await new Promise((r) => setTimeout(r, 100))
  }
}

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}
const post = async (path, body, headers = {}) => {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: r.status, data: await r.json() }
}
const get = async (path, headers = {}) => {
  const r = await fetch(API + path, { headers })
  return { status: r.status, data: await r.json() }
}

function client(token, nick) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WSU)
    const inbox = []
    const waiters = []
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw)
      const wi = waiters.findIndex((w) => w.type === msg.type)
      if (wi >= 0) waiters.splice(wi, 1)[0].resolve(msg)
      else inbox.push(msg)
    })
    const api = {
      send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
      wait: (type, timeout = 15000) =>
        new Promise((res, rej) => {
          const ii = inbox.findIndex((m) => m.type === type)
          if (ii >= 0) return res(inbox.splice(ii, 1)[0])
          waiters.push({ type, resolve: res })
          setTimeout(() => rej(new Error(`timeout waiting ${type} (${nick})`)), timeout)
        }),
      close: () => ws.close(),
    }
    ws.on('open', () => {
      api.send('hello', { token, nick })
      resolve(api)
    })
  })
}

async function playBattle(A, B, { itemsA = [], surrenderA = false, nsfwA = false } = {}) {
  A.send('find_match')
  B.send('find_match')
  await Promise.all([A.wait('match_found'), B.wait('match_found')])
  A.send('ready')
  B.send('ready')
  await Promise.all([A.wait('battle_start'), B.wait('battle_start')])
  await new Promise((r) => setTimeout(r, 1200)) // дождаться live-фазы
  const acks = []
  for (const it of itemsA) {
    A.send('item', { id: it.id, item: it.item, flag: it.flag || null, phash: it.phash })
    acks.push(await A.wait('item_ack'))
    await B.wait('opp_item')
  }
  if (nsfwA) A.send('nsfw')
  else if (surrenderA) A.send('surrender')
  const [endA, endB] = await Promise.all([A.wait('battle_end', 20000), B.wait('battle_end', 20000)])
  return { endA, endB, acks }
}

// --- 1. Регистрация и логин ---
const rA = await post('/api/register', { nick: 'ProA', email: 'a@test.io', password: 'passpass' })
const rB = await post('/api/register', { nick: 'ProB', email: 'b@test.io', password: 'passpass' })
check('регистрация', rA.status === 200 && rB.status === 200)
const dupe = await post('/api/register', { nick: 'ProA', email: 'x@test.io', password: 'passpass' })
check('дубль ника отклонён', dupe.status === 409)
const badLogin = await post('/api/login', { email: 'a@test.io', password: 'wrong' })
check('неверный пароль отклонён', badLogin.status === 401)
const okLogin = await post('/api/login', { email: 'a@test.io', password: 'passpass' })
check('логин', okLogin.status === 200 && okLogin.data.profile.nick === 'ProA')

// --- 2. Гость не может в рейтинговую очередь ---
const guest = await client(null, 'Guest')
guest.send('find_match')
const denied = await guest.wait('queue_denied')
check('гостю отказано в рейтинговой очереди', !!denied.message)
guest.close()

// --- 3. Рейтинговый матч: серверный ELO ---
let A = await client(rA.data.token, 'ProA')
let B = await client(rB.data.token, 'ProB')
const watch = { name: 'Rolex Submariner Date 126610LN', category: 'watch', price: 12000, confidence: 0.9 }
const b1 = await playBattle(A, B, {
  itemsA: [{ id: 1, item: watch, phash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' }],
})
check('айтем засчитан (без флага)', b1.acks[0].flag === null)
check('исход A=win', b1.endA.outcome === 'win' && b1.endB.outcome === 'loss')
check('ELO дельта от сервера', b1.endA.eloDelta === 16 && b1.endB.eloDelta === -16, `got ${b1.endA.eloDelta}/${b1.endB.eloDelta}`)
check('новый ELO', b1.endA.newElo === 1016 && b1.endB.newElo === 984)

// --- 4. Античит §7.4: повтор предмета в новом матче = 0 очков ---
const b2 = await playBattle(A, B, {
  itemsA: [
    { id: 1, item: watch, phash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' }, // то же имя, другой хэш
    { id: 2, item: { name: 'Совсем другой предмет', category: 'tech', price: 500, confidence: 0.9 },
      phash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567891' }, // другое имя, хэш прошлого кадра
  ],
})
check('повтор по имени обнулён', b2.acks[0].flag === 'repeat', `got ${b2.acks[0].flag}`)
check('повтор по pHash обнулён', b2.acks[1].flag === 'repeat', `got ${b2.acks[1].flag}`)
check('счёт раунда с повторами = 0:0, ничья', b2.endA.outcome === 'draw' && b2.endA.myScore === 0)

// --- 5. Репорт → модерация → бан → отказ в очереди ---
A.send('find_match')
B.send('find_match')
await Promise.all([A.wait('match_found'), B.wait('match_found')])
A.send('ready')
B.send('ready')
await Promise.all([A.wait('battle_start'), B.wait('battle_start')])
await new Promise((r) => setTimeout(r, 1200))
B.send('report', { reason: 'показывает экран' })
await B.wait('report_ack')
A.send('surrender')
await Promise.all([A.wait('battle_end'), B.wait('battle_end')])

const reps = await get('/api/admin/reports', ADMIN)
check('жалоба в очереди модерации', reps.data.reports.some((r) => r.reporter === 'ProB' && r.reported === 'ProA' && r.status === 'open'))

await post('/api/admin/ban', { nick: 'ProA', banned: true, reason: 'test ban' }, ADMIN)
const bannedLogin = await post('/api/login', { email: 'a@test.io', password: 'passpass' })
check('бан блокирует логин', bannedLogin.status === 403)
A.close()
A = await client(rA.data.token, 'ProA')
A.send('find_match')
const deniedBan = await A.wait('queue_denied')
check('бан блокирует очередь', !!deniedBan.message)
await post('/api/admin/ban', { nick: 'ProA', banned: false }, ADMIN)

// --- 6. NSFW: автостоп + автобан до модерации ---
A.close()
B.close()
A = await client(rA.data.token, 'ProA')
B = await client(rB.data.token, 'ProB')
const bN = await playBattle(A, B, { nsfwA: true })
check('NSFW: тех. поражение нарушителю', bN.endA.outcome === 'loss' && bN.endA.reason === 'nsfw' && bN.endB.outcome === 'win')
const players = await get('/api/admin/players', ADMIN)
const pa = players.data.players.find((p) => p.nick === 'ProA')
check('NSFW: автобан до модерации', pa.banned === 1 && /nsfw/.test(pa.ban_reason))
const repsN = await get('/api/admin/reports', ADMIN)
check('NSFW: системная жалоба создана', repsN.data.reports.some((r) => r.reporter === 'system' && r.reported === 'ProA'))
await post('/api/admin/ban', { nick: 'ProA', banned: false }, ADMIN)

// --- 7. Лидерборд и /api/me ---
const lb = await get('/api/leaderboard')
const names = lb.data.players.map((p) => p.nick)
check('лидерборд с бэка', names.includes('ProA') && names.includes('ProB'))
const me = await get('/api/me', { authorization: `Bearer ${rA.data.token}` })
check('/api/me: статистика и лимит', me.data.profile.wins >= 1 && me.data.dailyLimit > 0 && me.data.battlesToday >= 3,
  `wins=${me.data.profile.wins} today=${me.data.battlesToday}`)

// --- 8. Дневной лимит (в тестовом окружении = 4, сыграно 4) ---
A.close()
B.close()
A = await client(rA.data.token, 'ProA')
A.send('find_match')
const deniedLimit = await A.wait('queue_denied')
check('дневной лимит баттлов', /лимит/i.test(deniedLimit.message), deniedLimit.message)
A.close()

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS (21)')
process.exit(failures ? 1 : 0)
