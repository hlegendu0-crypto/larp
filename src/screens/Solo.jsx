import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ItemCard, PageShell } from '../components/ui.jsx'
import { FrameCapture } from '../lib/capture.js'
import { analyzeFrame, getAiConfig } from '../lib/vision.js'
import { fmtUsd } from '../lib/elo.js'
import { REJECT_REASONS } from '../data/mock.js'

// Этап 2 (ТЗ §10): режим «оцени мой флекс» — реальный AI-пайплайн §7.1–7.3
// на своей камере, без соперника и без рейтинга.

const ROUND_SEC = 60
const MAX_FRAMES = 15 // лимит кадров на раунд — контроль стоимости (ТЗ §11)
const MAX_STRIKES = 3

const normalizeName = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export default function Solo() {
  const [phase, setPhase] = useState('idle') // idle | live | done
  const [timeLeft, setTimeLeft] = useState(ROUND_SEC)
  const [feed, setFeed] = useState([]) // новые сверху
  const [framesSent, setFramesSent] = useState(0)
  const [pending, setPending] = useState(0) // кадров в анализе
  const [strikes, setStrikes] = useState(0)
  const [endReason, setEndReason] = useState(null) // null | 'time' | 'dq' | 'nsfw'
  const [error, setError] = useState(null)
  const [camError, setCamError] = useState(false)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const captureRef = useRef(null)
  const countedNamesRef = useRef(new Set())
  const strikesRef = useRef(0)
  const idRef = useRef(0)
  const hasKey = !!getAiConfig().apiKey

  // Камера живёт, пока открыт экран
  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => !cancelled && setCamError(true))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      captureRef.current?.stop()
    }
  }, [])

  const finish = useCallback((reason) => {
    captureRef.current?.stop()
    setEndReason(reason)
    setPhase('done')
  }, [])

  // Таймер раунда
  useEffect(() => {
    if (phase !== 'live') return
    const started = Date.now()
    const id = setInterval(() => {
      const left = ROUND_SEC - (Date.now() - started) / 1000
      setTimeLeft(Math.max(0, left))
      if (left <= 0) {
        clearInterval(id)
        finish('time')
      }
    }, 250)
    return () => clearInterval(id)
  }, [phase, finish])

  const handleAnalysis = useCallback(
    (result) => {
      if (result.nsfw) {
        // ТЗ §7.5: NSFW → мгновенное завершение
        finish('nsfw')
        return
      }
      const entries = []
      for (const item of result.items || []) {
        const norm = normalizeName(item.name)
        let flag = null
        let reason = null
        if (item.is_screen_or_photo) {
          flag = 'screen'
          reason = REJECT_REASONS.screen
          strikesRef.current++
          setStrikes(strikesRef.current)
        } else if (countedNamesRef.current.has(norm)) {
          flag = 'dup'
          reason = REJECT_REASONS.dup
        } else if (item.confidence < 0.5) {
          flag = 'lowconf'
          reason = REJECT_REASONS.lowconf
        } else {
          countedNamesRef.current.add(norm)
        }
        entries.push({
          kind: 'item',
          player: 'me',
          id: ++idRef.current,
          flag,
          reason,
          item: {
            name: item.name,
            category: item.category,
            price: Math.round(item.est_price_usd),
            confidence: Math.round(item.confidence * 100) / 100,
          },
        })
      }
      if (entries.length) setFeed((f) => [...entries.reverse(), ...f])
      if (strikesRef.current >= MAX_STRIKES) finish('dq') // §7.3: 3 страйка = дисквалификация
    },
    [finish],
  )

  const start = () => {
    setFeed([])
    setFramesSent(0)
    setPending(0)
    setStrikes(0)
    setError(null)
    setEndReason(null)
    setTimeLeft(ROUND_SEC)
    countedNamesRef.current = new Set()
    strikesRef.current = 0
    setPhase('live')

    const capture = new FrameCapture(videoRef.current, {
      maxFrames: MAX_FRAMES,
      onFrame: async (frame) => {
        setFramesSent((n) => n + 1)
        setPending((n) => n + 1)
        try {
          const result = await analyzeFrame(frame)
          handleAnalysis(result)
        } catch (e) {
          setError(e.message)
          if (e.code === 'auth' || e.code === 'no_key') finish('time')
        } finally {
          setPending((n) => n - 1)
        }
      },
    })
    captureRef.current = capture
    capture.start()
  }

  const counted = feed.filter((e) => !e.flag)
  const score = counted.reduce((s, e) => s + e.item.price, 0)

  if (!hasKey) {
    return (
      <PageShell>
        <div className="fade-up pt-16 max-w-md mx-auto text-center panel p-10">
          <h1 className="font-display text-2xl mb-3">Оцени мой флекс</h1>
          <p className="text-sm text-muted mb-6">
            Для реального AI-анализа нужен ключ Anthropic API. Добавьте его в настройках — он
            хранится только в вашем браузере.
          </p>
          <Button to="/settings">Открыть настройки</Button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell wide>
      <div className="fade-up pt-4">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h1 className="font-display text-3xl">Оцени мой флекс</h1>
            <p className="text-sm text-muted mt-1">
              Соло-режим: покажите вещи в камеру — AI распознает и оценит. Без рейтинга.
            </p>
          </div>
          {phase === 'live' && (
            <div className={`font-display text-3xl ${timeLeft <= 10 ? 'text-danger' : ''}`}>
              0:{String(Math.ceil(timeLeft)).padStart(2, '0')}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-[1.6fr_1fr] gap-4">
          {/* Камера */}
          <div className="relative panel overflow-hidden aspect-video">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
            {camError && (
              <div className="absolute inset-0 flex items-center justify-center bg-graphite text-sm text-muted p-6 text-center">
                Камера недоступна. Разрешите доступ и обновите страницу.
              </div>
            )}
            {phase === 'live' && (
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.25em] bg-ink/70 rounded-full px-3 py-1 text-accent-soft">
                  {pending > 0 ? 'Анализ…' : 'Live'}
                </span>
                {strikes > 0 && (
                  <span className="text-[10px] uppercase tracking-[0.2em] bg-danger/20 text-danger rounded-full px-3 py-1">
                    Страйки: {strikes}/{MAX_STRIKES}
                  </span>
                )}
              </div>
            )}
            {phase === 'idle' && !camError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/60 gap-4">
                <p className="text-sm text-muted max-w-xs text-center">
                  60 секунд. Держите предмет в кадре ~1 секунду, чтобы AI его зафиксировал.
                </p>
                <Button onClick={start}>Начать раунд</Button>
              </div>
            )}
            {phase === 'done' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/80 gap-3 p-6 text-center">
                <div className="text-xs uppercase tracking-[0.3em] text-muted">
                  {endReason === 'dq'
                    ? 'Дисквалификация — 3 страйка'
                    : endReason === 'nsfw'
                      ? 'Раунд остановлен: недопустимый контент'
                      : 'Раунд завершён'}
                </div>
                <div className="font-display text-5xl accent-text font-semibold">
                  {endReason === 'dq' || endReason === 'nsfw' ? '$0' : fmtUsd(score)}
                </div>
                <div className="text-sm text-muted">
                  {counted.length} айтемов · {framesSent} кадров проанализировано
                </div>
                <div className="flex gap-3 mt-3">
                  <Button onClick={start}>Ещё раз</Button>
                  <Button variant="ghost" to="/lobby">В лобби</Button>
                </div>
              </div>
            )}
          </div>

          {/* Лента + счёт */}
          <div className="flex flex-col gap-3 min-h-0">
            <div className="panel px-5 py-4 flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-[0.2em] text-muted">Flex Score</span>
              <span className="font-display text-2xl text-accent-soft">{fmtUsd(score)}</span>
            </div>
            <div className="text-[11px] text-muted px-1">
              Кадров: {framesSent}/{MAX_FRAMES} · в анализе: {pending}
            </div>
            <div className="flex-1 min-h-48 max-h-96 overflow-y-auto scroll-thin space-y-2 pr-1">
              {feed.length === 0 && phase === 'live' && (
                <div className="text-sm text-muted pt-6 text-center pulse-soft">
                  Покажите предмет в камеру…
                </div>
              )}
              {feed.map((e) => (
                <ItemCard key={e.id} event={e} />
              ))}
            </div>
            {error && <div className="text-xs text-danger">{error}</div>}
            {phase === 'live' && (
              <Button variant="ghost" className="!py-2 text-xs" onClick={() => finish('time')}>
                Завершить раунд
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-[11px] text-muted">
          Оценки формирует AI («≈») и они не являются экспертизой. Кадры отправляются в Anthropic
          API только в момент анализа и не сохраняются платформой.{' '}
          <Link to="/settings" className="text-accent hover:text-accent-soft">Модель и ключ — в настройках</Link>.
        </p>
      </div>
    </PageShell>
  )
}
