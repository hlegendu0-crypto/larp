import { API_URL } from './config.js'

// HTTP API бэкенда (этап 4): аккаунты, лидерборд, админка модерации.

async function call(path, { method = 'GET', body, token, adminKey, timeoutMs = 4000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(API_URL + path, {
      method,
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(adminKey ? { 'x-admin-key': adminKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(data.error || `Ошибка сервера (${res.status})`, res.status)
    return data
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError('Сервер недоступен', 0)
  } finally {
    clearTimeout(timer)
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export const apiHealth = () => call('/api/health', { timeoutMs: 2000 })
export const apiRegister = (nick, email, password) =>
  call('/api/register', { method: 'POST', body: { nick, email, password } })
export const apiLogin = (email, password) =>
  call('/api/login', { method: 'POST', body: { email, password } })
export const apiMe = (token) => call('/api/me', { token })
export const apiLeaderboard = () => call('/api/leaderboard')

export const adminReports = (key) => call('/api/admin/reports', { adminKey: key })
export const adminPlayers = (key) => call('/api/admin/players', { adminKey: key })
export const adminResolve = (key, id) =>
  call('/api/admin/resolve', { method: 'POST', adminKey: key, body: { id } })
export const adminBan = (key, nick, banned, reason) =>
  call('/api/admin/ban', { method: 'POST', adminKey: key, body: { nick, banned, reason } })
