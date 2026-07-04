import { useEffect, useState } from 'react'
import { usePlayer } from '../store.jsx'
import { PageShell, RankBadge } from '../components/ui.jsx'
import { LEADERBOARD } from '../data/mock.js'
import { apiLeaderboard } from '../lib/api.js'

const winrate = (w, l) => (w + l ? Math.round((w / (w + l)) * 100) : 0)

export default function Leaderboard() {
  const { player } = usePlayer()
  const [period, setPeriod] = useState('all') // сезоны — бэклог (ТЗ §6.7)
  const [serverRows, setServerRows] = useState(null) // null = мок-фолбэк

  // Этап 4: реальный глобальный топ с бэка; при недоступном сервере — мок этапа 1
  useEffect(() => {
    apiLeaderboard()
      .then((data) => setServerRows(data.players))
      .catch(() => setServerRows(null))
  }, [])

  const rows = serverRows ? [...serverRows] : [...LEADERBOARD]
  if (player) {
    const mineIdx = rows.findIndex((r) => r.nick === player.nick)
    if (mineIdx >= 0) rows[mineIdx] = { ...rows[mineIdx], me: true }
    else rows.push({ nick: player.nick, elo: player.elo, wins: player.wins, losses: player.losses, me: true })
  }
  rows.sort((a, b) => b.elo - a.elo)
  const myIndex = rows.findIndex((r) => r.me)

  return (
    <PageShell>
      <div className="fade-up pt-4">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl">Лидерборд</h1>
            {!serverRows && (
              <p className="text-[11px] text-muted mt-1">Демо-данные — сервер недоступен</p>
            )}
          </div>
          <div className="flex gap-1 text-xs">
            {[
              ['all', 'За всё время'],
              ['season', 'Сезон'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => key === 'all' && setPeriod(key)}
                disabled={key === 'season'}
                title={key === 'season' ? 'Сезоны появятся позже' : undefined}
                className={`rounded-full px-4 py-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  period === key ? 'hairline text-accent-soft' : 'text-muted hover:text-cream'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_auto_4rem_4rem] gap-3 px-5 py-3 text-[11px] uppercase tracking-[0.15em] text-muted border-b border-line">
            <span>#</span>
            <span>Игрок</span>
            <span>Ранг</span>
            <span className="text-right">ELO</span>
            <span className="text-right">Винрейт</span>
          </div>
          <div className="divide-y divide-line">
            {rows.map((r, i) => (
              <div
                key={r.nick}
                className={`grid grid-cols-[2.5rem_1fr_auto_4rem_4rem] gap-3 items-center px-5 py-3.5 text-sm ${
                  r.me ? 'bg-accent/5' : ''
                }`}
              >
                <span className={`font-display ${i < 3 ? 'accent-text font-semibold' : 'text-muted'}`}>{i + 1}</span>
                <span className="font-semibold truncate">
                  {r.nick}
                  {r.me && <span className="ml-2 text-[10px] uppercase tracking-widest text-accent">вы</span>}
                </span>
                <RankBadge elo={r.elo} size="sm" />
                <span className="font-display text-accent-soft text-right">{r.elo}</span>
                <span className="text-muted text-right">{winrate(r.wins, r.losses)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Закреплённая строка своей позиции */}
        {player && myIndex >= 0 && (
          <div className="sticky bottom-4 mt-4">
            <div className="panel border-accent/40 grid grid-cols-[2.5rem_1fr_auto_4rem_4rem] gap-3 items-center px-5 py-3.5 text-sm shadow-xl bg-panel">
              <span className="font-display text-accent">{myIndex + 1}</span>
              <span className="font-semibold truncate">{player.nick}</span>
              <RankBadge elo={player.elo} size="sm" />
              <span className="font-display text-accent-soft text-right">{player.elo}</span>
              <span className="text-muted text-right">{winrate(player.wins, player.losses)}%</span>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
