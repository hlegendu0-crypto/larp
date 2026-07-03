// Мок-данные этапа 1. На этапах 2–4 заменяются реальным AI-пайплайном и бэкендом.

export const ITEM_POOL = [
  { name: 'Rolex Submariner Date 126610LN', category: 'watch', min: 10500, max: 14500 },
  { name: 'Audemars Piguet Royal Oak 15500ST', category: 'watch', min: 38000, max: 52000 },
  { name: 'Omega Speedmaster Moonwatch', category: 'watch', min: 5800, max: 7600 },
  { name: 'Cartier Santos de Cartier LM', category: 'watch', min: 6900, max: 8400 },
  { name: 'Porsche 911 Carrera (992)', category: 'car', min: 105000, max: 135000 },
  { name: 'Mercedes-AMG G 63', category: 'car', min: 160000, max: 210000 },
  { name: 'BMW M4 Competition', category: 'car', min: 78000, max: 95000 },
  { name: 'MacBook Pro 16" M4 Max', category: 'tech', min: 3400, max: 4300 },
  { name: 'iPhone 17 Pro Max 1TB', category: 'tech', min: 1500, max: 1800 },
  { name: 'Sony A1 II + 24-70 GM', category: 'tech', min: 7500, max: 9200 },
  { name: 'PC-сетап (RTX 5090, кастом)', category: 'tech', min: 5200, max: 7800 },
  { name: 'Louis Vuitton Keepall 55', category: 'fashion', min: 2300, max: 2900 },
  { name: 'Chrome Hearts Hoodie', category: 'fashion', min: 1400, max: 2200 },
  { name: 'Nike x Off-White Jordan 1 Chicago', category: 'fashion', min: 5500, max: 8000 },
  { name: 'Loro Piana пальто кашемир', category: 'fashion', min: 4800, max: 6500 },
  { name: 'Цепь Cuban Link 14k, 150 г', category: 'jewelry', min: 9000, max: 12500 },
  { name: 'Кольцо Cartier Love, белое золото', category: 'jewelry', min: 5300, max: 6200 },
  { name: 'Van Cleef & Arpels Alhambra', category: 'jewelry', min: 4200, max: 5600 },
  { name: 'Eames Lounge Chair (Herman Miller)', category: 'interior', min: 6500, max: 8200 },
  { name: 'Бар-кабинет орех, ручная работа', category: 'interior', min: 3800, max: 5400 },
]

export const CHALLENGES = [
  'Покажите два пальца рядом с предметом',
  'Медленно поверните предмет',
  'Поднесите предмет ближе к камере',
  'Покажите предмет с обратной стороны',
]

export const REJECT_REASONS = {
  dup: 'Дубликат — предмет уже засчитан',
  screen: 'Изображение на экране — не засчитано',
  lowconf: 'Не распознан уверенно (confidence < 0.5)',
}

export const OPPONENTS = [
  { nick: 'GoldRushKing', elo: 1268 },
  { nick: 'VelvetGarage', elo: 1192 },
  { nick: 'MidasTouch', elo: 1315 },
  { nick: 'NoirCollector', elo: 1080 },
  { nick: 'CarbonBaron', elo: 1147 },
  { nick: 'SilkRoadCEO', elo: 1224 },
]

export const LEADERBOARD = [
  { nick: 'AurumPrime', elo: 2085, wins: 214, losses: 61 },
  { nick: 'VaultKeeper', elo: 1994, wins: 187, losses: 70 },
  { nick: 'MonacoDrift', elo: 1932, wins: 165, losses: 74 },
  { nick: 'PatekPilot', elo: 1877, wins: 142, losses: 68 },
  { nick: 'EstateMode', elo: 1811, wins: 133, losses: 71 },
  { nick: 'MidasTouch', elo: 1315, wins: 88, losses: 63 },
  { nick: 'GoldRushKing', elo: 1268, wins: 74, losses: 59 },
  { nick: 'SilkRoadCEO', elo: 1224, wins: 66, losses: 58 },
  { nick: 'VelvetGarage', elo: 1192, wins: 59, losses: 55 },
  { nick: 'CarbonBaron', elo: 1147, wins: 51, losses: 52 },
  { nick: 'NoirCollector', elo: 1080, wins: 44, losses: 50 },
  { nick: 'FlexIntern', elo: 1012, wins: 21, losses: 27 },
]

export const CATEGORY_LABELS = {
  watch: 'Часы',
  car: 'Авто',
  tech: 'Техника',
  fashion: 'Гардероб',
  jewelry: 'Украшения',
  interior: 'Интерьер',
}

const rnd = (min, max) => min + Math.random() * (max - min)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

function makeItem(pool) {
  const base = pick(pool)
  return {
    name: base.name,
    category: base.category,
    price: Math.round(rnd(base.min, base.max) / 50) * 50,
    confidence: Math.round(rnd(0.55, 0.97) * 100) / 100,
  }
}

// Скрипт демо-баттла: события распознаваний для обоих игроков + челленджи (ТЗ §10, этап 1).
export function generateBattleScript(durationSec = 60) {
  const events = []
  for (const player of ['me', 'opp']) {
    const count = 4 + Math.floor(Math.random() * 4) // 4–7 айтемов
    const used = []
    let t = rnd(4, 8)
    for (let i = 0; i < count && t < durationSec - 4; i++) {
      const item = makeItem(ITEM_POOL)
      let flag = null
      if (used.includes(item.name)) flag = 'dup'
      else if (Math.random() < 0.12) flag = 'screen'
      else if (Math.random() < 0.1) {
        item.confidence = Math.round(rnd(0.2, 0.45) * 100) / 100
        flag = 'lowconf'
      }
      used.push(item.name)
      events.push({ t: Math.round(t * 10) / 10, kind: 'item', player, item, flag })
      t += rnd(5, 11)
    }
  }
  // 1–2 челленджа за раунд, только для своего игрока (ТЗ §7.4)
  const challengeTimes = Math.random() < 0.5 ? [rnd(18, 26)] : [rnd(14, 20), rnd(38, 46)]
  for (const ct of challengeTimes) {
    events.push({ t: Math.round(ct * 10) / 10, kind: 'challenge', text: pick(CHALLENGES) })
  }
  return events.sort((a, b) => a.t - b.t)
}

export function pickOpponent(myElo) {
  // Заглушка матчмейкинга: ELO ±150 (ТЗ §6.4)
  const near = OPPONENTS.filter((o) => Math.abs(o.elo - myElo) <= 150)
  return pick(near.length ? near : OPPONENTS)
}
