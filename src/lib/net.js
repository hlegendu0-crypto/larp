import { SIGNALING_URL } from './config.js'

// Клиент сигналинг-сервера (этап 3). Тонкая обёртка над WebSocket:
// send(type, payload), on(type, handler), onClose(handler).

export function connectSignaling({ nick, elo, token, timeoutMs = 2500 } = {}) {
  return new Promise((resolve, reject) => {
    let ws
    try {
      ws = new WebSocket(SIGNALING_URL)
    } catch (e) {
      return reject(e)
    }
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('signaling timeout'))
    }, timeoutMs)

    const handlers = new Map()
    const closeHandlers = new Set()
    const sock = {
      raw: ws,
      send: (type, payload = {}) => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }))
      },
      on: (type, fn) => {
        handlers.set(type, fn)
        return () => handlers.delete(type)
      },
      onClose: (fn) => {
        closeHandlers.add(fn)
        return () => closeHandlers.delete(fn)
      },
      close: () => {
        closeHandlers.clear()
        handlers.clear()
        ws.close()
      },
    }

    ws.onopen = () => {
      clearTimeout(timer)
      sock.send('hello', { nick, elo, token })
      resolve(sock)
    }
    ws.onerror = () => {
      clearTimeout(timer)
      reject(new Error('signaling unavailable'))
    }
    ws.onmessage = (e) => {
      let msg
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }
      handlers.get(msg.type)?.(msg)
    }
    ws.onclose = () => closeHandlers.forEach((fn) => fn())
  })
}

// Живой сокет передаётся между экранами (лобби → баттл) через модуль,
// а не через navigation state — сокет несериализуем.
let activeSocket = null
export const setActiveSocket = (s) => {
  activeSocket = s
}
export const takeActiveSocket = () => {
  const s = activeSocket
  activeSocket = null
  return s
}
