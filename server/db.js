// Хранилище этапа 4: SQLite (node:sqlite, без внешних зависимостей).
// Схема 1:1 переносится на PostgreSQL при выходе на несколько инстансов (ТЗ §9).
import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'

const DB_PATH = process.env.DB_PATH || new URL('./larpbattle.db', import.meta.url).pathname

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nick TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    elo INTEGER NOT NULL DEFAULT 1000,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    a_id INTEGER NOT NULL,
    b_id INTEGER NOT NULL,
    a_score INTEGER NOT NULL,
    b_score INTEGER NOT NULL,
    reason TEXT NOT NULL,
    winner_id INTEGER,
    friendly INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Античит-база показанных айтемов (ТЗ §7.4): повтор в новых матчах = 0 очков, окно 7 дней
  CREATE TABLE IF NOT EXISTS items_seen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    name_norm TEXT NOT NULL,
    phash TEXT,
    price INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_items_seen_player ON items_seen(player_id, created_at);

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter TEXT NOT NULL,
    reported TEXT NOT NULL,
    room TEXT,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'open',  -- open | resolved
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// Секрет подписи токенов переживает рестарты
export function getTokenSecret() {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'token_secret'`).get()
  if (row) return row.value
  const secret = randomBytes(32).toString('hex')
  db.prepare(`INSERT INTO meta (key, value) VALUES ('token_secret', ?)`).run(secret)
  return secret
}

// --- players ---
export const findPlayerByEmail = (email) =>
  db.prepare(`SELECT * FROM players WHERE email = ?`).get(email)
export const findPlayerByNick = (nick) =>
  db.prepare(`SELECT * FROM players WHERE nick = ?`).get(nick)
export const findPlayerById = (id) => db.prepare(`SELECT * FROM players WHERE id = ?`).get(id)

export function createPlayer({ nick, email, passHash, salt }) {
  const r = db
    .prepare(`INSERT INTO players (nick, email, pass_hash, salt) VALUES (?, ?, ?, ?)`)
    .run(nick, email, passHash, salt)
  return findPlayerById(r.lastInsertRowid)
}

export function applyBattleResult(id, { deltaElo, won }) {
  db.prepare(
    `UPDATE players SET elo = MAX(0, elo + ?), wins = wins + ?, losses = losses + ? WHERE id = ?`,
  ).run(deltaElo, won ? 1 : 0, won ? 0 : 1, id)
  return findPlayerById(id)
}

export const setBan = (nick, banned, reason = null) =>
  db.prepare(`UPDATE players SET banned = ?, ban_reason = ? WHERE nick = ?`).run(banned ? 1 : 0, reason, nick)

export const leaderboard = (limit = 50) =>
  db
    .prepare(
      `SELECT nick, elo, wins, losses FROM players WHERE banned = 0 ORDER BY elo DESC, wins DESC LIMIT ?`,
    )
    .all(limit)

export const listPlayers = (limit = 200) =>
  db
    .prepare(
      `SELECT nick, email, elo, wins, losses, banned, ban_reason, created_at FROM players ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit)

// --- matches ---
export const insertMatch = (m) =>
  db
    .prepare(
      `INSERT INTO matches (room, a_id, b_id, a_score, b_score, reason, winner_id, friendly)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(m.room, m.aId, m.bId, m.aScore, m.bScore, m.reason, m.winnerId, m.friendly ? 1 : 0)

export const battlesToday = (playerId) =>
  db
    .prepare(
      `SELECT COUNT(*) AS n FROM matches
       WHERE (a_id = ? OR b_id = ?) AND created_at >= datetime('now', 'start of day')`,
    )
    .get(playerId, playerId).n

// --- items_seen (античит §7.4) ---
export const recentItems = (playerId, days = 7) =>
  db
    .prepare(
      `SELECT name_norm, phash FROM items_seen
       WHERE player_id = ? AND created_at >= datetime('now', ?)`,
    )
    .all(playerId, `-${days} days`)

export const insertSeenItem = (playerId, { nameNorm, phash, price }) =>
  db
    .prepare(`INSERT INTO items_seen (player_id, name_norm, phash, price) VALUES (?, ?, ?, ?)`)
    .run(playerId, nameNorm, phash || null, price)

// --- reports (модерация §7.4) ---
export const insertReport = (r) =>
  db
    .prepare(`INSERT INTO reports (reporter, reported, room, reason) VALUES (?, ?, ?, ?)`)
    .run(r.reporter, r.reported, r.room || null, r.reason || null)

export const listReports = (status = null) =>
  status
    ? db.prepare(`SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 200`).all(status)
    : db.prepare(`SELECT * FROM reports ORDER BY created_at DESC LIMIT 200`).all()

export const resolveReport = (id) =>
  db.prepare(`UPDATE reports SET status = 'resolved' WHERE id = ?`).run(id)
