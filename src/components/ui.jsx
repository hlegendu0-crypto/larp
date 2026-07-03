import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { rankFor, fmtUsd } from '../lib/elo.js'
import { CATEGORY_LABELS } from '../data/mock.js'

export function AnimatedScore({ value, className = '' }) {
  const [shown, setShown] = useState(value)
  const shownRef = useRef(value)
  const raf = useRef()
  useEffect(() => {
    const from = shownRef.current
    const start = performance.now()
    const dur = 700
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = from + (value - from) * eased
      shownRef.current = v
      setShown(v)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value])
  return <span className={`font-display ${className}`}>${Math.round(shown).toLocaleString('en-US')}</span>
}

export function Logo({ className = '' }) {
  return (
    <span className={`font-display font-semibold tracking-wide ${className}`}>
      <span className="accent-text">Larp</span>
      <span className="text-cream">Battle</span>
    </span>
  )
}

export function Button({ variant = 'accent', className = '', as, to, ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold tracking-wide transition-all duration-300 cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = {
    accent: 'bg-gradient-to-b from-accent-soft to-accent text-ink hover:brightness-110 shadow-[0_0_30px_rgba(212,180,106,0.15)]',
    ghost: 'border border-line text-cream hover:border-accent/50 hover:text-accent-soft',
    danger: 'border border-danger/50 text-danger hover:bg-danger/10',
  }
  const cls = `${base} ${styles[variant]} ${className}`
  if (to) return <Link to={to} className={cls} {...props} />
  return <button className={cls} {...props} />
}

export function RankBadge({ elo, size = 'md' }) {
  const rank = rankFor(elo)
  const sizes = { sm: 'text-[10px] px-2 py-0.5', md: 'text-xs px-3 py-1' }
  return (
    <span
      className={`inline-flex items-center rounded-full hairline uppercase tracking-[0.18em] text-accent-soft/90 ${sizes[size]}`}
    >
      {rank.name}
    </span>
  )
}

export function CategoryIcon({ category, className = 'w-4 h-4' }) {
  const c = 'stroke-accent fill-none stroke-[1.5]'
  const icons = {
    watch: (
      <svg viewBox="0 0 24 24" className={className}>
        <circle cx="12" cy="12" r="6" className={c} />
        <path d="M12 9v3l2 2M10 6l1-3h2l1 3M10 18l1 3h2l1-3" className={c} strokeLinecap="round" />
      </svg>
    ),
    car: (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M4 15l1.5-5A2 2 0 0 1 7.4 8.5h9.2a2 2 0 0 1 1.9 1.5L20 15v3h-2M4 15v3h2m-2-3h16M7 18a1.5 1.5 0 1 0 3 0m4 0a1.5 1.5 0 1 0 3 0" className={c} strokeLinecap="round" />
      </svg>
    ),
    tech: (
      <svg viewBox="0 0 24 24" className={className}>
        <rect x="4" y="6" width="16" height="11" rx="1.5" className={c} />
        <path d="M9 20h6" className={c} strokeLinecap="round" />
      </svg>
    ),
    fashion: (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M9 4l3 2 3-2 4 4-2.5 2.5L15 9v10H9V9l-1.5 1.5L5 8z" className={c} strokeLinejoin="round" />
      </svg>
    ),
    jewelry: (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M8 4h8l3 5-7 11L5 9z M5 9h14 M8 4l4 5 4-5 M12 9v11" className={c} strokeLinejoin="round" />
      </svg>
    ),
    interior: (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M5 13a2 2 0 0 1 2 2v2h10v-2a2 2 0 0 1 4 0v4H3v-4a2 2 0 0 1 2-2z" className={c} strokeLinecap="round" />
      </svg>
    ),
  }
  return icons[category] || icons.tech
}

export function ItemCard({ event }) {
  const { item, flag } = event
  const counted = !flag
  return (
    <div
      className={`card-in panel flex items-center gap-3 px-4 py-3 ${counted ? '' : 'opacity-60'}`}
    >
      <div className="shrink-0 w-9 h-9 rounded-full hairline flex items-center justify-center">
        <CategoryIcon category={item.category} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{item.name}</div>
        <div className="text-[11px] text-muted">
          {CATEGORY_LABELS[item.category]} · confidence {item.confidence.toFixed(2)}
        </div>
      </div>
      <div className="text-right shrink-0">
        {counted ? (
          <div className="font-display text-accent-soft">{fmtUsd(item.price)}</div>
        ) : (
          <div className="text-[11px] text-danger max-w-28 leading-tight">{event.reason}</div>
        )}
      </div>
    </div>
  )
}

export function OnlineCounter({ className = '' }) {
  const [n, setN] = useState(1240 + Math.floor(Math.random() * 200))
  useEffect(() => {
    const id = setInterval(() => setN((v) => Math.max(900, v + Math.floor(Math.random() * 11) - 5)), 2500)
    return () => clearInterval(id)
  }, [])
  return (
    <span className={`inline-flex items-center gap-2 text-sm text-muted ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-win pulse-soft" />
      {n.toLocaleString('ru-RU')} игроков онлайн
    </span>
  )
}

export function PageShell({ children, wide = false }) {
  return (
    <div className={`mx-auto px-4 sm:px-6 py-8 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>{children}</div>
  )
}
