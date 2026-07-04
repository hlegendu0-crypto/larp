import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, OnlineCounter, PageShell, RankBadge } from '../components/ui.jsx'
import { pickOpponent } from '../data/mock.js'
import { connectSignaling, setActiveSocket } from '../lib/net.js'
import { ROUND_SEC } from '../lib/config.js'

export default function Lobby() {
  const { player } = usePlayer()
  const navigate = useNavigate()
  const [mode, setMode] = useState(null) // null | 'queue' | 'friend'
  const [waitSec, setWaitSec] = useState(0)
  const [copied, setCopied] = useState(false)
  const [demo, setDemo] = useState(false) // сервер недоступен — режим симуляции
  const [denied, setDenied] = useState(null) // отказ сервера (нет аккаунта / бан / лимит)
  const [inviteCode, setInviteCode] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => () => socketRef.current?.close(), [])

  const goLive = (socket, msg) => {
    socketRef.current = null // сокет переезжает в баттл
    setActiveSocket(socket)
    navigate('/battle', {
      state: { live: true, opponent: msg.opponent, friendly: msg.friendly, polite: msg.polite },
    })
  }

  // Быстрый матч: реальная очередь через сервер, при недоступности — демо этапа 1
  useEffect(() => {
    if (mode !== 'queue') return
    setWaitSec(0)
    setDemo(false)
    setDenied(null)
    const tick = setInterval(() => setWaitSec((s) => s + 1), 1000)
    let demoTimer = null
    let cancelled = false

    connectSignaling({ nick: player.nick, elo: player.elo, token: player.token })
      .then((socket) => {
        if (cancelled) return socket.close()
        socketRef.current = socket
        socket.on('match_found', (msg) => goLive(socket, msg))
        socket.on('queue_denied', (msg) => {
          setDenied(msg.message)
          setMode(null)
        })
        socket.onClose(() => !cancelled && setMode(null))
        socket.send('find_match')
      })
      .catch(() => {
        if (cancelled) return
        setDemo(true)
        demoTimer = setTimeout(
          () => navigate('/battle', { state: { opponent: pickOpponent(player.elo) } }),
          3000 + Math.random() * 3000,
        )
      })

    return () => {
      cancelled = true
      clearInterval(tick)
      clearTimeout(demoTimer)
      if (socketRef.current) {
        socketRef.current.send('cancel_find')
        socketRef.current.close()
        socketRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Вызов друга: реальная комната с кодом, при недоступности сервера — демо
  const createRoom = async () => {
    setMode('friend')
    setInviteCode(null)
    setDemo(false)
    try {
      const socket = await connectSignaling({ nick: player.nick, elo: player.elo, token: player.token })
      socketRef.current = socket
      socket.on('room_created', (msg) => setInviteCode(msg.code))
      socket.on('match_found', (msg) => goLive(socket, msg))
      socket.send('create_room')
    } catch {
      setDemo(true)
    }
  }

  const eloRange = 150 + Math.floor(waitSec / 10) * 100 // расширение окна (ТЗ §6.4)
  const inviteLink = inviteCode
    ? `${location.origin}${location.pathname}#/join/${inviteCode}`
    : null

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* буфер недоступен — ссылка видна в поле */
    }
  }

  return (
    <PageShell>
      <div className="fade-up pt-4">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl mb-1">Лобби</h1>
            <OnlineCounter />
          </div>
          <div className="text-right">
            <div className="font-display text-2xl text-accent-soft">{player.elo}</div>
            <RankBadge elo={player.elo} size="sm" />
          </div>
        </div>

        {denied && (
          <div className="panel border-danger/40 px-5 py-4 mb-4 text-sm text-danger card-in">
            {denied}
          </div>
        )}

        {mode === 'queue' ? (
          <div className="panel p-10 text-center">
            <div className="mx-auto w-20 h-20 rounded-full hairline flex items-center justify-center mb-6">
              <div className="w-14 h-14 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            </div>
            <div className="font-display text-2xl mb-2">Подбор соперника</div>
            <p className="text-sm text-muted">
              Диапазон ELO: ±{eloRange} · В очереди {waitSec} c
            </p>
            {demo && (
              <p className="mt-2 text-xs text-muted">
                Сервер матчмейкинга недоступен — будет демо-баттл с симуляцией.
              </p>
            )}
            <div className="mt-2 h-1 max-w-56 mx-auto rounded-full overflow-hidden bg-graphite">
              <div className="h-full shimmer" />
            </div>
            <Button variant="ghost" className="mt-8" onClick={() => setMode(null)}>
              Отменить
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('queue')}
              className="panel p-8 text-left hover:border-accent/40 transition-colors cursor-pointer group"
            >
              <div className="text-xs uppercase tracking-[0.25em] text-accent mb-3">Рейтинговый</div>
              <div className="font-display text-2xl group-hover:text-accent-soft transition-colors">
                Быстрый матч
              </div>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                Соперник вашего уровня (ELO ±150). Раунд {ROUND_SEC} секунд, на кону рейтинг.
              </p>
            </button>

            <div className={`panel p-8 text-left transition-colors ${mode === 'friend' ? 'border-accent/40' : ''}`}>
              <div className="text-xs uppercase tracking-[0.25em] text-muted mb-3">Приватный</div>
              <div className="font-display text-2xl">Вызов друга</div>
              {mode === 'friend' ? (
                demo ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-muted">
                      Сервер недоступен — реальная комната не создана. Можно сыграть демо-баттл
                      с симуляцией соперника.
                    </p>
                    <Button
                      className="!py-2 text-xs"
                      onClick={() =>
                        navigate('/battle', { state: { opponent: pickOpponent(player.elo), friendly: true } })
                      }
                    >
                      Демо-баттл
                    </Button>
                  </div>
                ) : !inviteCode ? (
                  <p className="mt-4 text-sm text-muted pulse-soft">Создаём комнату…</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    <input
                      readOnly
                      value={inviteLink}
                      className="w-full rounded-lg bg-graphite border border-line px-3 py-2 text-xs text-cream/80"
                      onFocus={(e) => e.target.select()}
                    />
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" className="flex-1 !py-2 text-xs" onClick={copyInvite}>
                        {copied ? 'Скопировано' : 'Копировать ссылку'}
                      </Button>
                      <span className="font-display text-lg tracking-[0.2em] text-accent-soft">{inviteCode}</span>
                    </div>
                    <p className="text-[11px] text-muted pulse-soft">
                      Ждём соперника — баттл начнётся, как только друг откроет ссылку.
                    </p>
                  </div>
                )
              ) : (
                <>
                  <p className="mt-3 text-sm text-muted leading-relaxed">
                    Сгенерируйте инвайт-ссылку и позовите соперника в приватную комнату. Без рейтинга.
                  </p>
                  <Button variant="ghost" className="mt-4 !py-2 text-xs" onClick={createRoom}>
                    Создать комнату
                  </Button>
                </>
              )}
            </div>

            <button
              onClick={() => navigate('/solo')}
              className="panel p-8 text-left hover:border-accent/40 transition-colors cursor-pointer group sm:col-span-2"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs uppercase tracking-[0.25em] text-accent">Соло · реальный AI</span>
                <span className="text-[10px] uppercase tracking-widest hairline rounded-full px-2 py-0.5 text-accent-soft/80">
                  этап 2
                </span>
              </div>
              <div className="font-display text-2xl group-hover:text-accent-soft transition-colors">
                Оцени мой флекс
              </div>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                Раунд без соперника: Claude vision распознаёт ваши вещи и оценивает их стоимость
                вживую. Без рейтинга — чистая проверка флекса.
              </p>
            </button>
          </div>
        )}
      </div>
    </PageShell>
  )
}
