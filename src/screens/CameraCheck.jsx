import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, PageShell } from '../components/ui.jsx'
import { CameraView } from '../components/CameraView.jsx'

const HINTS = [
  'Поднимите камеру на уровень глаз',
  'Встаньте лицом к источнику света',
  'Держите предмет на расстоянии 30–50 см от камеры',
]

export default function CameraCheck() {
  const navigate = useNavigate()
  const [camStatus, setCamStatus] = useState('pending') // pending | ok | error
  const [lighting, setLighting] = useState(null) // симуляция индикаторов (этап 1)
  const [framing, setFraming] = useState(null)
  const onStatus = useCallback((s) => setCamStatus(s), [])

  useEffect(() => {
    if (camStatus !== 'ok') return
    const t1 = setTimeout(() => setLighting('good'), 1200)
    const t2 = setTimeout(() => setFraming('good'), 2000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [camStatus])

  const Indicator = ({ label, state }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      {state === 'good' ? (
        <span className="text-win">Хорошо</span>
      ) : camStatus === 'ok' ? (
        <span className="text-muted pulse-soft">Анализ…</span>
      ) : (
        <span className="text-muted">—</span>
      )}
    </div>
  )

  return (
    <PageShell>
      <div className="fade-up pt-4">
        <h1 className="font-display text-3xl mb-1">Camera Check</h1>
        <p className="text-sm text-muted mb-8">Проверьте кадр перед входом в очередь.</p>

        <div className="grid md:grid-cols-[1.5fr_1fr] gap-5">
          <div className="panel overflow-hidden aspect-video relative">
            <CameraView className="w-full h-full" onStatus={onStatus} />
            {camStatus === 'ok' && (
              <span className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.25em] bg-ink/70 rounded-full px-3 py-1 text-champagne">
                Превью
              </span>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <div className="panel p-5 space-y-4">
              <Indicator label="Освещение" state={lighting} />
              <Indicator label="Фрейминг" state={framing} />
              <Indicator label="Камера" state={camStatus === 'ok' ? 'good' : null} />
            </div>
            <div className="panel p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-muted mb-3">Подсказки</div>
              <ul className="space-y-2 text-sm text-cream/80">
                {HINTS.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="text-gold">·</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              disabled={camStatus !== 'ok'}
              onClick={() => navigate('/lobby')}
              className="w-full"
            >
              Готов к баттлу
            </Button>
            {camStatus === 'error' && (
              <p className="text-xs text-danger">
                Без камеры баттл невозможен. Разрешите доступ и обновите страницу.
              </p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
