import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, PageShell } from '../components/ui.jsx'
import { connectSignaling, setActiveSocket } from '../lib/net.js'

// Вход в приватную комнату по инвайт-ссылке /#/join/CODE (этап 3)
export default function JoinRoom() {
  const { code } = useParams()
  const { player } = usePlayer()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    let socket = null
    let cancelled = false
    connectSignaling({ nick: player.nick, elo: player.elo })
      .then((s) => {
        if (cancelled) return s.close()
        socket = s
        s.on('room_error', (msg) => setError(msg.message))
        s.on('match_found', (msg) => {
          socket = null // сокет переезжает в баттл
          setActiveSocket(s)
          navigate('/battle', {
            replace: true,
            state: { live: true, opponent: msg.opponent, friendly: msg.friendly, polite: msg.polite },
          })
        })
        s.send('join_room', { code })
      })
      .catch(() => !cancelled && setError('Сервер недоступен. Попробуйте позже.'))
    return () => {
      cancelled = true
      socket?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return (
    <PageShell>
      <div className="fade-up pt-16 max-w-md mx-auto text-center panel p-10">
        <div className="text-xs uppercase tracking-[0.3em] text-muted mb-3">Приватная комната</div>
        <div className="font-display text-3xl tracking-[0.2em] mb-6">{String(code).toUpperCase()}</div>
        {error ? (
          <>
            <p className="text-sm text-danger mb-6">{error}</p>
            <Button variant="ghost" to="/lobby">В лобби</Button>
          </>
        ) : (
          <>
            <div className="mx-auto w-12 h-12 rounded-full border-2 border-accent/30 border-t-accent animate-spin mb-4" />
            <p className="text-sm text-muted">Подключаемся к комнате…</p>
          </>
        )}
      </div>
    </PageShell>
  )
}
