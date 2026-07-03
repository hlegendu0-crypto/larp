import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, ItemCard, RankBadge } from '../components/ui.jsx'
import { CameraView, FakeOpponentVideo } from '../components/CameraView.jsx'
import { generateBattleScript, REJECT_REASONS, pickOpponent } from '../data/mock.js'
import { fmtUsd } from '../lib/elo.js'

const ROUND_SEC = 60 // длительность раунда — параметр (ТЗ §3)

function AnimatedScore({ value, className = '' }) {
  const [shown, setShown] = useState(value)
  const raf = useRef()
  useEffect(() => {
    const from = shown
    const start = performance.now()
    const dur = 700
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(from + (value - from) * eased)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <span className={`font-display ${className}`}>${Math.round(shown).toLocaleString('en-US')}</span>
}

export default function Battle() {
  const { player } = usePlayer()
  const navigate = useNavigate()
  const location = useLocation()
  const opponent = useMemo(
    () => location.state?.opponent || pickOpponent(player.elo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const friendly = !!location.state?.friendly

  const [phase, setPhase] = useState('vs') // vs | countdown | live | counting
  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [feed, setFeed] = useState([]) // события-распознавания, новые сверху
  const [challenge, setChallenge] = useState(null) // { text, left }
  const [swap, setSwap] = useState(false) // PiP: поменять потоки местами
  const [toast, setToast] = useState(null)
  const [confirmExit, setConfirmExit] = useState(false)

  const script = useMemo(() => generateBattleScript(ROUND_SEC), [])
  const processedRef = useRef(0)
  const endedRef = useRef(false)

  const showToast = (text) => {
    setToast(text)
    setTimeout(() => setToast(null), 2500)
  }

  // Заставка VS → отсчёт 3-2-1 → live
  useEffect(() => {
    if (phase === 'vs') {
      const t = setTimeout(() => setPhase('countdown'), 2600)
      return () => clearTimeout(t)
    }
    if (phase === 'countdown') {
      if (count === 0) {
        setPhase('live')
        return
      }
      const t = setTimeout(() => setCount((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [phase, count])

  const finish = (opts = {}) => {
    if (endedRef.current) return
    endedRef.current = true
    setPhase('counting')
    const countedItems = (opts.feed || feed).filter((e) => e.kind === 'item' && !e.flag && !e.voided)
    const sum = (p) => countedItems.filter((e) => e.player === p).reduce((s, e) => s + e.item.price, 0)
    const myScore = sum('me')
    const oppScore = sum('opp')
    const myItems = (opts.feed || feed).filter((e) => e.kind === 'item' && e.player === 'me')
    const oppItems = (opts.feed || feed).filter((e) => e.kind === 'item' && e.player === 'opp')
    setTimeout(() => {
      navigate('/results', {
        replace: true,
        state: {
          opponent,
          friendly,
          myScore,
          oppScore,
          myItems,
          oppItems,
          technical: opts.technical || false,
          surrendered: opts.surrendered || false,
        },
      })
    }, 2500 + Math.random() * 1500) // «Идёт подсчёт…» 2–4 сек (ТЗ §6.6)
  }

  // Игровой цикл: тик 250 мс, выдача событий скрипта
  useEffect(() => {
    if (phase !== 'live') return
    const started = performance.now()
    const id = setInterval(() => {
      const sec = (performance.now() - started) / 1000
      setElapsed(sec)
      while (processedRef.current < script.length && script[processedRef.current].t <= sec) {
        const ev = script[processedRef.current++]
        // id фиксируется здесь: чтение ref внутри апдейтера даёт одинаковый key
        // всем событиям, обработанным за один тик
        const id = processedRef.current
        if (ev.kind === 'item') {
          setFeed((f) => [{ ...ev, reason: ev.flag ? REJECT_REASONS[ev.flag] : null, id }, ...f])
        } else if (ev.kind === 'challenge') {
          setChallenge({ text: ev.text, left: 5 })
        }
      }
      if (sec >= ROUND_SEC) {
        clearInterval(id)
        setFeed((f) => {
          finish({ feed: f })
          return f
        })
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Челлендж: 5 сек на выполнение, иначе обнуляется последний айтем (ТЗ §7.4)
  useEffect(() => {
    if (!challenge) return
    if (challenge.left <= 0) {
      setFeed((f) => {
        const idx = f.findIndex((e) => e.kind === 'item' && e.player === 'me' && !e.flag && !e.voided)
        if (idx === -1) return f
        const next = [...f]
        next[idx] = { ...next[idx], voided: true, reason: 'Челлендж не выполнен — обнулено' }
        return next
      })
      showToast('Челлендж провален — последний айтем обнулён')
      setChallenge(null)
      return
    }
    const t = setTimeout(() => setChallenge((c) => c && { ...c, left: c.left - 1 }), 1000)
    return () => clearTimeout(t)
  }, [challenge])

  const counted = feed.filter((e) => e.kind === 'item' && !e.flag && !e.voided)
  const myScore = counted.filter((e) => e.player === 'me').reduce((s, e) => s + e.item.price, 0)
  const oppScore = counted.filter((e) => e.player === 'opp').reduce((s, e) => s + e.item.price, 0)
  const total = myScore + oppScore
  const myShare = total ? myScore / total : 0.5
  const timeLeft = Math.max(0, ROUND_SEC - elapsed)

  // ---- Заставка VS ----
  if (phase === 'vs' || phase === 'countdown') {
    return (
      <div className="fixed inset-0 bg-ink flex flex-col items-center justify-center px-6">
        {phase === 'vs' ? (
          <div className="w-full max-w-2xl">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
              <div className="text-right fade-up">
                <div className="font-display text-2xl sm:text-4xl">{player.nick}</div>
                <div className="mt-2 flex justify-end"><RankBadge elo={player.elo} /></div>
                <div className="mt-1 font-display text-champagne">{player.elo} ELO</div>
              </div>
              <div className="vs-slam font-display text-5xl sm:text-7xl gold-text font-bold">VS</div>
              <div className="text-left fade-up" style={{ animationDelay: '0.15s' }}>
                <div className="font-display text-2xl sm:text-4xl">{opponent.nick}</div>
                <div className="mt-2"><RankBadge elo={opponent.elo} /></div>
                <div className="mt-1 font-display text-champagne">{opponent.elo} ELO</div>
              </div>
            </div>
            {friendly && (
              <p className="mt-10 text-center text-xs uppercase tracking-[0.3em] text-muted">
                Приватный матч · без рейтинга
              </p>
            )}
          </div>
        ) : (
          <div key={count} className="count-pop font-display text-[10rem] leading-none gold-text font-bold">
            {count || 'GO'}
          </div>
        )}
      </div>
    )
  }

  // ---- Подсчёт ----
  if (phase === 'counting') {
    return (
      <div className="fixed inset-0 bg-ink flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
        <div className="font-display text-3xl">Идёт подсчёт…</div>
        <p className="text-sm text-muted">Финализируем анализ айтемов</p>
      </div>
    )
  }

  // ---- Live ----
  const bigLabel = swap ? player.nick : opponent.nick
  const BigView = swap ? (
    <CameraView className="w-full h-full" />
  ) : (
    <FakeOpponentVideo className="w-full h-full" label={opponent.nick} />
  )
  const PipView = swap ? (
    <FakeOpponentVideo className="w-full h-full" label={opponent.nick} />
  ) : (
    <CameraView className="w-full h-full" />
  )

  return (
    <div className="fixed inset-0 bg-ink flex flex-col">
      {/* Верхняя панель: счёт и таймер */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-line bg-ink/90">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-xs uppercase tracking-[0.2em] text-muted">{player.nick}</div>
              <AnimatedScore value={myScore} className="text-xl sm:text-3xl text-champagne" />
            </div>
            <div className="text-center shrink-0">
              <div className={`font-display text-2xl sm:text-3xl ${timeLeft <= 10 ? 'text-danger' : ''}`}>
                0:{String(Math.ceil(timeLeft)).padStart(2, '0')}
              </div>
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate text-xs uppercase tracking-[0.2em] text-muted">{opponent.nick}</div>
              <AnimatedScore value={oppScore} className="text-xl sm:text-3xl" />
            </div>
          </div>
          {/* Перетягивание лидерства */}
          <div className="mt-3 h-1.5 rounded-full bg-graphite overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-gold to-champagne transition-all duration-700"
              style={{ width: `${myShare * 100}%` }}
            />
          </div>
          <div className="mt-1.5 h-0.5 rounded-full bg-graphite overflow-hidden">
            <div className="h-full bg-line" style={{ width: `${(elapsed / ROUND_SEC) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Видео + лента */}
      <div className="flex-1 min-h-0 mx-auto w-full max-w-5xl px-4 sm:px-6 py-4 grid md:grid-cols-[1.6fr_1fr] gap-4">
        <div className="relative panel overflow-hidden min-h-56">
          {BigView}
          <span className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.25em] bg-ink/70 rounded-full px-3 py-1 text-champagne">
            {bigLabel}
          </span>
          {/* PiP */}
          <button
            onClick={() => setSwap((s) => !s)}
            title="Поменять потоки местами"
            className="absolute bottom-3 right-3 w-32 sm:w-40 aspect-video rounded-lg overflow-hidden border border-gold/30 shadow-lg cursor-pointer hover:border-gold transition-colors"
          >
            {PipView}
          </button>
          {/* Челлендж-оверлей */}
          {challenge && (
            <div className="absolute inset-0 bg-ink/85 flex flex-col items-center justify-center p-6 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-gold mb-4">Челлендж · {challenge.left}с</div>
              <div className="font-display text-2xl max-w-sm">{challenge.text}</div>
              <Button
                className="mt-6"
                onClick={() => {
                  setChallenge(null)
                  showToast('Челлендж выполнен')
                }}
              >
                Выполнено
              </Button>
              <p className="mt-3 text-[11px] text-muted">Этап 1: подтверждение вручную. Далее — проверка vision-AI.</p>
            </div>
          )}
        </div>

        {/* Live-лента распознаваний */}
        <div className="min-h-0 flex flex-col">
          <div className="text-xs uppercase tracking-[0.2em] text-muted mb-2 shrink-0">Распознавания</div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin space-y-2 pr-1">
            {feed.filter((e) => e.kind === 'item').length === 0 && (
              <div className="text-sm text-muted pt-6 text-center pulse-soft">
                Покажите предмет в камеру…
              </div>
            )}
            {feed
              .filter((e) => e.kind === 'item')
              .map((e) => (
                <div key={e.id} className="relative">
                  <div className={`absolute -left-0.5 top-0 bottom-0 w-0.5 rounded ${e.player === 'me' ? 'bg-gold' : 'bg-line'}`} />
                  <ItemCard event={e.voided ? { ...e, flag: 'voided' } : e} />
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Нижняя панель действий */}
      <div className="border-t border-line px-4 sm:px-6 py-3 bg-ink/90">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="danger" className="!px-4 !py-2 text-xs" onClick={() => finish({ technical: true, surrendered: true })}>
              Сдаться
            </Button>
            <Button variant="ghost" className="!px-4 !py-2 text-xs" onClick={() => showToast('Жалоба отправлена модерации')}>
              Репорт
            </Button>
          </div>
          <div className="text-[11px] text-muted hidden sm:block">
            Выход или дисконнект = техническое поражение
          </div>
          <Button variant="ghost" className="!px-4 !py-2 text-xs" onClick={() => setConfirmExit(true)}>
            Выход
          </Button>
        </div>
      </div>

      {/* Тост */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 panel px-5 py-3 text-sm card-in z-50">
          {toast}
        </div>
      )}

      {/* Подтверждение выхода */}
      {confirmExit && (
        <div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-6">
          <div className="panel p-8 max-w-sm text-center card-in">
            <div className="font-display text-xl mb-2">Покинуть баттл?</div>
            <p className="text-sm text-muted mb-6">Выход засчитается как техническое поражение.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="ghost" onClick={() => setConfirmExit(false)}>Остаться</Button>
              <Button variant="danger" onClick={() => finish({ technical: true, surrendered: true })}>
                Выйти
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
