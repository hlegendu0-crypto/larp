// Параметры матча (ТЗ §3: длительность раунда настраиваемая)
export const ROUND_SEC = 20
export const MAX_FRAMES_PER_ROUND = 8 // лимит AI-кадров на раунд (ТЗ §11)

export const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787`
