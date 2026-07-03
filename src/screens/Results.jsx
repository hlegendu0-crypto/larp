import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, ItemCard, PageShell, RankBadge } from '../components/ui.jsx'
import { eloDelta, rankFor, fmtUsd } from '../lib/elo.js'

export default function Results() {
  const { player, applyResult } = usePlayer()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [copied, setCopied] = useState(false)
  const appliedRef = useRef(false)

  const result = useMemo(() => {
    if (!state) return null
    const won = state.surrendered ? false : state.myScore > state.oppScore
    const draw = !state.surrendered && state.myScore === state.oppScore
    const delta = state.friendly
      ? 0
      : eloDelta(player.elo, state.opponent.elo, draw ? 0.5 : won ? 1 : 0, {
          technical: state.technical,
        })
    const bestMine = state.myItems
      .filter((e) => !e.flag && !e.voided)
      .sort((a, b) => b.item.price - a.item.price)[0]
    return { ...state, won, draw, delta, myBestItem: bestMine ? { name: bestMine.item.name, price: bestMine.item.price } : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const oldElo = useRef(player.elo)
  const oldRank = useRef(rankFor(player.elo).name)

  useEffect(() => {
    if (!result || appliedRef.current || result.friendly) return
    appliedRef.current = true
    applyResult({
      opponent: result.opponent.nick,
      myScore: result.myScore,
      oppScore: result.oppScore,
      delta: result.delta,
      won: result.won,
      technical: result.technical,
      myBestItem: result.myBestItem,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!result) return <Navigate to="/lobby" replace />

  const newElo = result.friendly ? oldElo.current : Math.max(0, oldElo.current + result.delta)
  const newRank = rankFor(newElo).name
  const rankedUp = newRank !== oldRank.current && result.delta > 0

  const share = async () => {
    const text = `LarpBattle — ${result.won ? 'победа' : result.draw ? 'ничья' : 'поражение'}: ${player.nick} ${fmtUsd(result.myScore)} vs ${result.opponent.nick} ${fmtUsd(result.oppScore)}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* noop */
    }
  }

  const Column = ({ title, items, score, highlight }) => (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">{title}</div>
        <div className={`font-display text-xl ${highlight ? 'text-accent-soft' : ''}`}>{fmtUsd(score)}</div>
      </div>
      <div className="space-y-2">
        {items.length === 0 && <div className="text-sm text-muted">Ни одного айтема</div>}
        {items.map((e, i) => (
          <ItemCard key={i} event={e.voided ? { ...e, flag: 'voided' } : e} />
        ))}
      </div>
    </div>
  )

  return (
    <PageShell wide>
      <div className="fade-up pt-6 text-center">
        <div className="text-xs uppercase tracking-[0.35em] text-muted mb-3">
          {result.friendly ? 'Приватный матч' : result.technical ? 'Техническое поражение' : 'Итог баттла'}
        </div>
        <h1 className={`font-display text-5xl sm:text-6xl font-semibold ${result.won ? 'accent-text' : ''}`}>
          {result.won ? 'Победа' : result.draw ? 'Ничья' : 'Поражение'}
        </h1>

        <div className="mt-8 flex items-center justify-center gap-8 sm:gap-14">
          <div className="text-right">
            <div className="text-sm text-muted">{player.nick}</div>
            <div className={`font-display text-3xl ${result.won ? 'text-accent-soft' : ''}`}>{fmtUsd(result.myScore)}</div>
          </div>
          <div className="font-display text-muted text-xl">—</div>
          <div className="text-left">
            <div className="text-sm text-muted">{result.opponent.nick}</div>
            <div className={`font-display text-3xl ${!result.won && !result.draw ? 'text-accent-soft' : ''}`}>
              {fmtUsd(result.oppScore)}
            </div>
          </div>
        </div>

        {!result.friendly && (
          <div className="mt-6 inline-flex items-center gap-4 panel px-6 py-3">
            <span className={`font-display text-2xl ${result.delta >= 0 ? 'text-win' : 'text-danger'}`}>
              {result.delta >= 0 ? '+' : ''}{result.delta} ELO
            </span>
            <span className="text-muted text-sm">→ {newElo}</span>
            <RankBadge elo={newElo} size="sm" />
            {rankedUp && <span className="text-xs accent-text font-semibold uppercase tracking-widest">Новый ранг!</span>}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => navigate('/battle', { state: { opponent: result.opponent, friendly: result.friendly } })}>
            Реванш
          </Button>
          <Button variant="ghost" to="/lobby">Новый матч</Button>
          <Button variant="ghost" onClick={share}>{copied ? 'Скопировано' : 'Поделиться результатом'}</Button>
        </div>
      </div>

      <div className="mt-14 grid md:grid-cols-2 gap-8">
        <Column title={`Айтемы — ${player.nick}`} items={result.myItems} score={result.myScore} highlight={result.won} />
        <Column title={`Айтемы — ${result.opponent.nick}`} items={result.oppItems} score={result.oppScore} highlight={!result.won && !result.draw} />
      </div>
      <p className="mt-10 text-center text-[11px] text-muted">
        Все суммы — приблизительная оценка AI и не являются экспертизой.
      </p>
    </PageShell>
  )
}
