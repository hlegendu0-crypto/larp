import { useEffect, useRef, useState } from 'react'

// Своя камера через getUserMedia (этап 1 — реальная, ТЗ §9/§10).
export function CameraView({ className = '', onStatus, mirrored = true }) {
  const videoRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let stream
    let cancelled = false
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) videoRef.current.srcObject = stream
        onStatus?.('ok')
      } catch (e) {
        if (!cancelled) {
          setError(e?.name === 'NotAllowedError' ? 'denied' : 'unavailable')
          onStatus?.('error')
        }
      }
    }
    start()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onStatus])

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-graphite text-center p-4 ${className}`}>
        <div className="text-sm text-muted">
          {error === 'denied'
            ? 'Доступ к камере отклонён. Разрешите доступ в настройках браузера.'
            : 'Камера недоступна на этом устройстве.'}
        </div>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`object-cover ${mirrored ? '-scale-x-100' : ''} ${className}`}
    />
  )
}

// Симуляция видеопотока соперника (этап 1): «живой» канвас с шумом и виньеткой.
export function FakeOpponentVideo({ className = '', label }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf
    let t = 0
    const draw = () => {
      t += 0.008
      const { width: w, height: h } = canvas
      const g = ctx.createLinearGradient(0, 0, w, h)
      const drift = Math.sin(t) * 0.15
      g.addColorStop(0, '#101014')
      g.addColorStop(0.5 + drift, '#1b1a20')
      g.addColorStop(1, '#0c0c10')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      // блуждающее «пятно света» — имитация движения в кадре
      const x = w * (0.5 + Math.sin(t * 1.7) * 0.25)
      const y = h * (0.45 + Math.cos(t * 1.1) * 0.15)
      const spot = ctx.createRadialGradient(x, y, 0, x, y, h * 0.55)
      spot.addColorStop(0, 'rgba(212,180,106,0.10)')
      spot.addColorStop(1, 'rgba(212,180,106,0)')
      ctx.fillStyle = spot
      ctx.fillRect(0, 0, w, h)
      // лёгкий шум
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5)
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className={`relative overflow-hidden bg-graphite ${className}`}>
      <canvas ref={canvasRef} width={640} height={360} className="w-full h-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 w-16 h-16 rounded-full hairline flex items-center justify-center font-display text-2xl text-champagne/80">
            {label?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="text-xs uppercase tracking-[0.25em] text-muted">live · симуляция</div>
        </div>
      </div>
    </div>
  )
}
