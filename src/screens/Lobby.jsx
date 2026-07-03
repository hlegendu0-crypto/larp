import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, OnlineCounter, PageShell, RankBadge } from '../components/ui.jsx'
import { pickOpponent } from '../data/mock.js'

export default function Lobby() {
  const { player } = usePlayer()
  const navigate = useNavigate()
  const [mode, setMode] = useState(null) // null | 'queue' | 'friend'
  const [waitSec, setWaitSec] = useState(0)
  const [copied, setCopied] = useState(false)
  const inviteLink = useRef(
    `https://larpbattle.app/i/${Math.random().toString(36).slice(2, 10)}`,
  )

  // Симуляция очереди: подбор через 3–7 сек (этап 1)
  useEffect(() => {
    if (mode !== 'queue') return
    setWaitSec(0)
    const tick = setInterval(() => setWaitSec((s) => s + 1), 1000)
    const matchIn = 3000 + Math.random() * 4000
    const match = setTimeout(() => {
      navigate('/battle', { state: { opponent: pickOpponent(player.elo) } })
    }, matchIn)
    return () => {
      clearInterval(tick)
      clearTimeout(match)
    }
  }, [mode, navigate, player.elo])

  const eloRange = 150 + Math.floor(waitSec / 10) * 50 // диапазон расширяется со временем (ТЗ §6.4)

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink.current)
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
            <div className="font-display text-2xl text-champagne">{player.elo}</div>
            <RankBadge elo={player.elo} size="sm" />
          </div>
        </div>

        {mode === 'queue' ? (
          <div className="panel p-10 text-center">
            <div className="mx-auto w-20 h-20 rounded-full hairline flex items-center justify-center mb-6">
              <div className="w-14 h-14 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
            </div>
            <div className="font-display text-2xl mb-2">Подбор соперника</div>
            <p className="text-sm text-muted">
              Диапазон ELO: ±{eloRange} · В очереди {waitSec} c
            </p>
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
              className="panel p-8 text-left hover:border-gold/40 transition-colors cursor-pointer group"
            >
              <div className="text-xs uppercase tracking-[0.25em] text-gold mb-3">Рейтинговый</div>
              <div className="font-display text-2xl group-hover:text-champagne transition-colors">
                Быстрый матч
              </div>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                Соперник вашего уровня (ELO ±150). Раунд 60 секунд, на кону рейтинг.
              </p>
            </button>

            <div
              className={`panel p-8 text-left transition-colors ${mode === 'friend' ? 'border-gold/40' : ''}`}
            >
              <div className="text-xs uppercase tracking-[0.25em] text-muted mb-3">Приватный</div>
              <div className="font-display text-2xl">Вызов друга</div>
              {mode === 'friend' ? (
                <div className="mt-4 space-y-3">
                  <input
                    readOnly
                    value={inviteLink.current}
                    className="w-full rounded-lg bg-graphite border border-line px-3 py-2 text-xs text-cream/80"
                    onFocus={(e) => e.target.select()}
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1 !py-2 text-xs" onClick={copyInvite}>
                      {copied ? 'Скопировано' : 'Копировать ссылку'}
                    </Button>
                    <Button
                      className="flex-1 !py-2 text-xs"
                      onClick={() =>
                        navigate('/battle', { state: { opponent: pickOpponent(player.elo), friendly: true } })
                      }
                    >
                      Друг зашёл (демо)
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted">
                    Этап 1: комната симулируется. Реальные приватные комнаты — этап 3.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-sm text-muted leading-relaxed">
                    Сгенерируйте инвайт-ссылку и позовите соперника в приватную комнату.
                  </p>
                  <Button variant="ghost" className="mt-4 !py-2 text-xs" onClick={() => setMode('friend')}>
                    Создать комнату
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
