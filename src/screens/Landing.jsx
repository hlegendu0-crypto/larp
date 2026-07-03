import { Link } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, OnlineCounter, RankBadge } from '../components/ui.jsx'
import { LEADERBOARD } from '../data/mock.js'

const STEPS = [
  {
    n: '01',
    title: 'Покажи',
    text: 'Выходи в live 1v1 и показывай в камеру свои вещи — часы, авто, технику, гардероб.',
  },
  {
    n: '02',
    title: 'AI оценит',
    text: 'Vision-AI распознаёт каждый предмет и оценивает рыночную стоимость в реальном времени.',
  },
  {
    n: '03',
    title: 'Победи',
    text: 'Больший суммарный Flex Score забирает раунд. Побеждай, поднимай ELO, входи в высшие ранги.',
  },
]

export default function Landing() {
  const { player } = usePlayer()
  const top5 = LEADERBOARD.slice(0, 5)
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-20 pb-24 text-center">
          <div className="fade-up">
            <OnlineCounter className="justify-center" />
          </div>
          <h1 className="fade-up mt-6 font-display text-5xl sm:text-7xl font-semibold leading-[1.05] tracking-tight" style={{ animationDelay: '0.08s' }}>
            Твои вещи <span className="gold-text">говорят за тебя</span>
          </h1>
          <p className="fade-up mx-auto mt-6 max-w-xl text-muted text-lg" style={{ animationDelay: '0.16s' }}>
            Live 1v1 видео-баттлы. 60 секунд. AI оценивает всё, что ты покажешь.
            Побеждает больший Flex Score.
          </p>
          <div className="fade-up mt-10 flex items-center justify-center gap-4" style={{ animationDelay: '0.24s' }}>
            <Button to={player ? '/camera-check' : '/login'} className="text-base px-10 py-4">
              В баттл
            </Button>
            <Button variant="ghost" to="/leaderboard">Лидерборд</Button>
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <h2 className="text-center text-xs uppercase tracking-[0.3em] text-muted mb-10">
          Как это работает
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="panel p-7">
              <div className="font-display gold-text text-lg">{s.n}</div>
              <div className="mt-3 font-display text-2xl">{s.title}</div>
              <p className="mt-3 text-sm text-muted leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Топ-5 */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-xs uppercase tracking-[0.3em] text-muted">Лучшие игроки</h2>
          <Link to="/leaderboard" className="text-sm text-gold hover:text-champagne transition-colors">
            Весь лидерборд →
          </Link>
        </div>
        <div className="panel divide-y divide-line">
          {top5.map((p, i) => (
            <div key={p.nick} className="flex items-center gap-4 px-5 py-4">
              <span className="font-display w-6 text-champagne/70">{i + 1}</span>
              <span className="flex-1 font-semibold">{p.nick}</span>
              <RankBadge elo={p.elo} size="sm" />
              <span className="font-display text-champagne w-16 text-right">{p.elo}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
