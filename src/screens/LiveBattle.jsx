import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { AnimatedScore, Button, ItemCard, RankBadge } from '../components/ui.jsx'
import { takeActiveSocket } from '../lib/net.js'
import { createPeer } from '../lib/rtc.js'
import { FrameCapture } from '../lib/capture.js'
import { analyzeFrame, getAiConfig } from '../lib/vision.js'
import { MAX_FRAMES_PER_ROUND } from '../lib/config.js'
import { REJECT_REASONS } from '../data/mock.js'

// Этап 3 (ТЗ §10): live 1v1 — WebRTC-видеосвязь, синхронизация счёта через
// сигналинг-сервер. Каждый игрок гоняет AI-пайплайн этапа 2 локально по своей
// камере; распознанные айтемы ретранслируются сопернику сервером.

const normalizeName = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export default function LiveBattle() {
  const { player } = usePlayer()
  const navigate = useNavigate()
  const { state } = useLocation()
  const opponent = state?.opponent || { nick: '???', elo: 1000 }
  const friendly = !!state?.friendly

  const [phase, setPhase] = useState('connect') // connect | vs | countdown | live | counting
  const [count, setCount] = useState(3)
  const [connState, setConnState] = useState('соединение…')
  const [elapsed, setElapsed] = useState(0)
  const [durationSec, setDurationSec] = useState(20)
  const [feed, setFeed] = useState([])
  const [swap, setSwap] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [framesSent, setFramesSent] = useState(0)

  const socketRef = useRef(null)
  const peerRef = useRef(null)
  const localStreamRef = useRef(null)
  const bigRef = useRef(null)
  const pipRef = useRef(null)
  const captureRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const startAtRef = useRef(null)
  const clockOffsetRef = useRef(0)
  const countedNamesRef = useRef(new Set())
  const idRef = useRef(0)
  const endedRef = useRef(false)
  const hasKey = !!getAiConfig().apiKey

  const showToast = (text) => {
    setToast(text)
    setTimeout(() => setToast(null), 2500)
  }

  // Прикрепление потоков к <video> с учётом swap
  const attachStreams = useCallback(() => {
    const big = bigRef.current
    const pip = pipRef.current
    if (!big || !pip) return
    const [bigStream, pipStream] = swap
      ? [localStreamRef.current, remoteStreamRef.current]
      : [remoteStreamRef.current, localStreamRef.current]
    if (big.srcObject !== bigStream) big.srcObject = bigStream
    if (pip.srcObject !== pipStream) pip.srcObject = pipStream
  }, [swap])

  useEffect(() => {
    attachStreams()
  })

  // Основной жизненный цикл: сокет + медиа + WebRTC + события боя
  useEffect(() => {
    const socket = takeActiveSocket()
    if (!socket || !state?.live) {
      navigate('/lobby', { replace: true })
      return
    }
    socketRef.current = socket
    let disposed = false

    const finishToResults = (payload) => {
      if (endedRef.current) return
      endedRef.current = true
      captureRef.current?.stop()
      setPhase('counting')
      setTimeout(() => {
        setFeed((f) => {
          navigate('/results', {
            replace: true,
            state: {
              opponent,
              friendly,
              live: true,
              myScore: payload.myScore,
              oppScore: payload.oppScore,
              myItems: f.filter((e) => e.player === 'me'),
              oppItems: f.filter((e) => e.player === 'opp'),
              technical: payload.technical,
              surrendered: payload.outcome === 'loss' && payload.reason !== 'time',
              outcome: payload.outcome,
              endReason: payload.reason,
              // Этап 4: ELO считает сервер (только рейтинговые матчи аккаунтов)
              eloDelta: payload.eloDelta,
              newElo: payload.newElo,
            },
          })
          return f
        })
      }, 1800)
    }

    socket.on('signal', (msg) => peerRef.current?.handleSignal(msg.data))

    socket.on('battle_start', (msg) => {
      clockOffsetRef.current = msg.serverNow - Date.now()
      startAtRef.current = msg.startAt - clockOffsetRef.current
      setDurationSec(msg.durationMs / 1000)
      setPhase('vs')
    })

    socket.on('opp_item', (msg) => {
      setFeed((f) => [
        {
          kind: 'item',
          player: 'opp',
          id: `opp-${++idRef.current}`,
          flag: msg.flag,
          reason: msg.reason,
          item: msg.item,
        },
        ...f,
      ])
    })

    // Вердикт сервера по нашему айтему (этап 4): античит-база может обнулить повтор
    socket.on('item_ack', (msg) => {
      setFeed((f) =>
        f.map((e) => (e.id === `me-${msg.id}` ? { ...e, flag: msg.flag, reason: msg.reason } : e)),
      )
    })

    socket.on('report_ack', () => showToast('Жалоба отправлена модерации'))

    socket.on('battle_end', (msg) => finishToResults(msg))

    socket.onClose(() => {
      if (!endedRef.current && !disposed) {
        // Сервер упал/связь оборвалась до вердикта — считаем тех. победу за нами
        finishToResults({ reason: 'disconnect', outcome: 'win', technical: true, myScore: 0, oppScore: 0 })
      }
    })

    // Медиа + WebRTC
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: true })
      .then((stream) => {
        if (disposed) return stream.getTracks().forEach((t) => t.stop())
        localStreamRef.current = stream
        attachStreams()
        peerRef.current = createPeer({
          localStream: stream,
          polite: !!state.polite,
          sendSignal: (data) => socket.send('signal', { data }),
          onRemoteStream: (remote) => {
            remoteStreamRef.current = remote
            attachStreams()
          },
          onState: (s) => {
            setConnState(s)
            if (s === 'connected') socket.send('ready')
          },
        })
        // страховка: если ICE застрял, всё равно заявляем готовность через 8 сек
        setTimeout(() => !disposed && socket.send('ready'), 8000)
      })
      .catch(() => setConnState('камера недоступна'))

    return () => {
      disposed = true
      captureRef.current?.stop()
      peerRef.current?.close()
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      socket.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Фазы vs → countdown → live по синхронизированным часам
  useEffect(() => {
    if (phase !== 'vs' && phase !== 'countdown') return
    const id = setInterval(() => {
      const untilStart = startAtRef.current - Date.now()
      if (untilStart <= 0) {
        setPhase('live')
      } else if (untilStart <= 3000) {
        setPhase('countdown')
        setCount(Math.ceil(untilStart / 1000))
      }
    }, 100)
    return () => clearInterval(id)
  }, [phase])

  // Live: таймер + AI-пайплайн по своей камере
  useEffect(() => {
    if (phase !== 'live') return
    const tick = setInterval(() => {
      setElapsed((Date.now() - startAtRef.current) / 1000)
    }, 250)

    let capture = null
    if (hasKey && localStreamRef.current) {
      const probe = document.createElement('video')
      probe.muted = true
      probe.playsInline = true
      probe.srcObject = localStreamRef.current
      probe.play().catch(() => {})
      capture = new FrameCapture(probe, {
        maxFrames: MAX_FRAMES_PER_ROUND,
        onFrame: async (frame) => {
          setFramesSent((n) => n + 1)
          try {
            const result = await analyzeFrame(frame)
            if (result.nsfw) {
              // §7.5: NSFW → сервер завершает бой тех. поражением и банит до модерации
              socketRef.current?.send('nsfw')
              return
            }
            for (const it of result.items || []) {
              const norm = normalizeName(it.name)
              let flag = null
              let reason = null
              if (it.is_screen_or_photo) {
                flag = 'screen'
                reason = REJECT_REASONS.screen
              } else if (countedNamesRef.current.has(norm)) {
                flag = 'dup'
                reason = REJECT_REASONS.dup
              } else if (it.confidence < 0.5) {
                flag = 'lowconf'
                reason = REJECT_REASONS.lowconf
              } else {
                countedNamesRef.current.add(norm)
              }
              const item = {
                name: it.name,
                category: it.category,
                price: Math.round(it.est_price_usd),
                confidence: Math.round(it.confidence * 100) / 100,
              }
              const localId = ++idRef.current
              setFeed((f) => [
                { kind: 'item', player: 'me', id: `me-${localId}`, flag, reason, item },
                ...f,
              ])
              // id — для серверного вердикта (item_ack), phash — для античит-базы §7.4
              socketRef.current?.send('item', {
                id: localId,
                item,
                flag,
                reason,
                phash: frame.hash?.toString(16),
              })
            }
          } catch (e) {
            showToast(e.message)
          }
        },
      })
      capture.start()
      captureRef.current = capture
    }
    return () => {
      clearInterval(tick)
      capture?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const myScore = feed.filter((e) => e.player === 'me' && !e.flag).reduce((s, e) => s + e.item.price, 0)
  const oppScore = feed.filter((e) => e.player === 'opp' && !e.flag).reduce((s, e) => s + e.item.price, 0)
  const total = myScore + oppScore
  const myShare = total ? myScore / total : 0.5
  const timeLeft = Math.max(0, durationSec - elapsed)

  // ---- Соединение ----
  if (phase === 'connect') {
    return (
      <div className="fixed inset-0 bg-ink flex flex-col items-center justify-center gap-5 px-6">
        <div className="w-14 h-14 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        <div className="font-display text-2xl">Соединение с {opponent.nick}</div>
        <div className="text-xs uppercase tracking-[0.25em] text-muted">{connState}</div>
        <Button variant="ghost" className="mt-4 !py-2 text-xs" onClick={() => navigate('/lobby', { replace: true })}>
          Отменить
        </Button>
      </div>
    )
  }

  // ---- VS / отсчёт ----
  if (phase === 'vs' || phase === 'countdown') {
    return (
      <div className="fixed inset-0 bg-ink flex flex-col items-center justify-center px-6">
        {phase === 'vs' ? (
          <div className="w-full max-w-2xl">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
              <div className="text-right fade-up">
                <div className="font-display text-2xl sm:text-4xl">{player.nick}</div>
                <div className="mt-2 flex justify-end"><RankBadge elo={player.elo} /></div>
                <div className="mt-1 font-display text-accent-soft">{player.elo} ELO</div>
              </div>
              <div className="vs-slam font-display text-5xl sm:text-7xl accent-text font-bold">VS</div>
              <div className="text-left fade-up" style={{ animationDelay: '0.15s' }}>
                <div className="font-display text-2xl sm:text-4xl">{opponent.nick}</div>
                <div className="mt-2"><RankBadge elo={opponent.elo} /></div>
                <div className="mt-1 font-display text-accent-soft">{opponent.elo} ELO</div>
              </div>
            </div>
            <p className="mt-10 text-center text-xs uppercase tracking-[0.3em] text-muted">
              Live · {friendly ? 'приватный матч, без рейтинга' : 'рейтинговый матч'}
            </p>
          </div>
        ) : (
          <div key={count} className="count-pop font-display text-[10rem] leading-none accent-text font-bold">
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
        <div className="w-16 h-16 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        <div className="font-display text-3xl">Идёт подсчёт…</div>
        <p className="text-sm text-muted">Финализируем анализ айтемов</p>
      </div>
    )
  }

  // ---- Live ----
  return (
    <div className="fixed inset-0 bg-ink flex flex-col">
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-line bg-ink/90">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-xs uppercase tracking-[0.2em] text-muted">{player.nick}</div>
              <AnimatedScore value={myScore} className="text-xl sm:text-3xl text-accent-soft" />
            </div>
            <div className="text-center shrink-0">
              <div className={`font-display text-2xl sm:text-3xl ${timeLeft <= 5 ? 'text-danger' : ''}`}>
                0:{String(Math.ceil(timeLeft)).padStart(2, '0')}
              </div>
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate text-xs uppercase tracking-[0.2em] text-muted">{opponent.nick}</div>
              <AnimatedScore value={oppScore} className="text-xl sm:text-3xl" />
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-graphite overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-soft transition-all duration-700"
              style={{ width: `${myShare * 100}%` }}
            />
          </div>
          <div className="mt-1.5 h-0.5 rounded-full bg-graphite overflow-hidden">
            <div className="h-full bg-line" style={{ width: `${Math.min(100, (elapsed / durationSec) * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 mx-auto w-full max-w-5xl px-4 sm:px-6 py-4 grid md:grid-cols-[1.6fr_1fr] gap-4">
        <div className="relative panel overflow-hidden min-h-56 bg-graphite">
          <video ref={bigRef} autoPlay playsInline className={`w-full h-full object-cover ${swap ? '-scale-x-100' : ''}`} />
          <span className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.25em] bg-ink/70 rounded-full px-3 py-1 text-accent-soft">
            {swap ? player.nick : opponent.nick} · live
          </span>
          <button
            onClick={() => setSwap((s) => !s)}
            title="Поменять потоки местами"
            className="absolute bottom-3 right-3 w-32 sm:w-40 aspect-video rounded-lg overflow-hidden border border-accent/30 shadow-lg cursor-pointer hover:border-accent transition-colors bg-ink"
          >
            <video ref={pipRef} autoPlay playsInline muted className={`w-full h-full object-cover ${swap ? '' : '-scale-x-100'}`} />
          </button>
        </div>

        <div className="min-h-0 flex flex-col">
          <div className="flex items-baseline justify-between mb-2 shrink-0">
            <span className="text-xs uppercase tracking-[0.2em] text-muted">Распознавания</span>
            {hasKey ? (
              <span className="text-[10px] text-muted">кадров: {framesSent}/{MAX_FRAMES_PER_ROUND}</span>
            ) : (
              <span className="text-[10px] text-danger">нет API-ключа — ваши вещи не распознаются</span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin space-y-2 pr-1">
            {feed.length === 0 && (
              <div className="text-sm text-muted pt-6 text-center pulse-soft">Покажите предмет в камеру…</div>
            )}
            {feed.map((e) => (
              <div key={e.id} className="relative">
                <div className={`absolute -left-0.5 top-0 bottom-0 w-0.5 rounded ${e.player === 'me' ? 'bg-accent' : 'bg-line'}`} />
                <ItemCard event={e} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-line px-4 sm:px-6 py-3 bg-ink/90">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="danger" className="!px-4 !py-2 text-xs" onClick={() => socketRef.current?.send('surrender')}>
              Сдаться
            </Button>
            <Button variant="ghost" className="!px-4 !py-2 text-xs" onClick={() => socketRef.current?.send('report')}>
              Репорт
            </Button>
          </div>
          <div className="text-[11px] text-muted hidden sm:block">Выход или дисконнект = техническое поражение</div>
          <Button variant="ghost" className="!px-4 !py-2 text-xs" onClick={() => setConfirmExit(true)}>
            Выход
          </Button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 panel px-5 py-3 text-sm card-in z-50">{toast}</div>
      )}

      {confirmExit && (
        <div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-6">
          <div className="panel p-8 max-w-sm text-center card-in">
            <div className="font-display text-xl mb-2">Покинуть баттл?</div>
            <p className="text-sm text-muted mb-6">Выход засчитается как техническое поражение.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="ghost" onClick={() => setConfirmExit(false)}>Остаться</Button>
              <Button variant="danger" onClick={() => socketRef.current?.send('surrender')}>Выйти</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
