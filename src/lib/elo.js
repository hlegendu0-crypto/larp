// Ранги и ELO. Пороги и названия — параметры (правятся без релиза), см. ТЗ §8.
export const RANKS = [
  { name: 'Starter', min: 0 },
  { name: 'Hustler', min: 1100 },
  { name: 'Executive', min: 1300 },
  { name: 'Millionaire', min: 1500 },
  { name: 'Mogul', min: 1700 },
  { name: 'Tycoon', min: 1900 },
]

export function rankFor(elo) {
  let current = RANKS[0]
  for (const r of RANKS) if (elo >= r.min) current = r
  return current
}

export function nextRank(elo) {
  return RANKS.find((r) => r.min > elo) || null
}

// Классический ELO. K=32; техническая победа/поражение — K=16 (ТЗ §8).
export function eloDelta(myElo, oppElo, myScore, { technical = false } = {}) {
  const K = technical ? 16 : 32
  const expected = 1 / (1 + Math.pow(10, (oppElo - myElo) / 400))
  return Math.round(K * (myScore - expected))
}

export function fmtUsd(n) {
  return '≈ $' + Math.round(n).toLocaleString('en-US')
}
