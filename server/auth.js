// Аккаунты этапа 4: пароли — scrypt, токены — подписанные HMAC (упрощённый JWT).
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto'

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt)
  const a = Buffer.from(hash)
  const b = Buffer.from(expectedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

const b64u = (s) => Buffer.from(s).toString('base64url')

export function signToken(secret, payload, ttlMs = 30 * 24 * 3600 * 1000) {
  const body = b64u(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }))
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyToken(secret, token) {
  if (typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
