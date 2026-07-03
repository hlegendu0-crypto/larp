import { Link } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, PageShell, RankBadge } from '../components/ui.jsx'
import { fmtUsd, nextRank } from '../lib/elo.js'

export default function Profile() {
  const { player } = usePlayer()
  const battles = player.wins + player.losses
  const winrate = battles ? Math.round((player.wins / battles) * 100) : 0
  const next = nextRank(player.elo)

  // Топ-3 предметов по истории пока не трекается отдельно — показываем лучший (этап 1)
  const stats = [
    ['ELO', player.elo],
    ['Баттлов', battles],
    ['Винрейт', battles ? `${winrate}%` : '—'],
    ['Побед', player.wins],
  ]

  return (
    <PageShell>
      <div className="fade-up pt-4">
        <div className="flex items-center gap-5 mb-8">
          <div className="w-20 h-20 rounded-full hairline flex items-center justify-center font-display text-4xl text-champagne">
            {player.nick[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="font-display text-3xl">{player.nick}</h1>
            <div className="mt-2 flex items-center gap-3">
              <RankBadge elo={player.elo} />
              {next && (
                <span className="text-xs text-muted">
                  до {next.name}: {next.min - player.elo} ELO
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" to="/settings" className="!py-2 text-xs">Настройки</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {stats.map(([label, value]) => (
            <div key={label} className="panel p-5 text-center">
              <div className="font-display text-2xl text-champagne">{value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">{label}</div>
            </div>
          ))}
        </div>

        <div className="panel p-6 mb-8">
          <div className="text-xs uppercase tracking-[0.2em] text-muted mb-3">Самый дорогой айтем</div>
          {player.bestItem ? (
            <div className="flex items-baseline justify-between">
              <div className="font-semibold">{player.bestItem.name}</div>
              <div className="font-display text-xl gold-text">{fmtUsd(player.bestItem.price)}</div>
            </div>
          ) : (
            <div className="text-sm text-muted">Ещё не показан. Сыграйте первый баттл.</div>
          )}
        </div>

        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted">История матчей</h2>
          <Link to="/lobby" className="text-sm text-gold hover:text-champagne transition-colors">В баттл →</Link>
        </div>
        <div className="panel divide-y divide-line">
          {player.history.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted">История пуста</div>
          )}
          {player.history.map((h, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${h.won ? 'bg-win' : 'bg-danger'}`} />
              <span className="flex-1 min-w-0">
                <span className="font-semibold">vs {h.opponent}</span>
                {h.technical && <span className="ml-2 text-[10px] uppercase tracking-widest text-muted">тех.</span>}
                <span className="block text-[11px] text-muted">
                  {new Date(h.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
              <span className="font-display text-muted hidden sm:block">
                {fmtUsd(h.myScore)} : {fmtUsd(h.oppScore)}
              </span>
              <span className={`font-display w-14 text-right ${h.delta >= 0 ? 'text-win' : 'text-danger'}`}>
                {h.delta >= 0 ? '+' : ''}{h.delta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
