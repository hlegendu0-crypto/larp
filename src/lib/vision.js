import Anthropic from '@anthropic-ai/sdk'

// Vision-анализ кадра (ТЗ §7.2): кадр → Claude API → строгий JSON через
// structured outputs. Промпт зафиксирован и версионируется — консистентность
// оценок важнее абсолютной точности.

export const PROMPT_VERSION = 'flex-appraiser-v1'
export const DEFAULT_MODEL = 'claude-opus-4-8'

export const MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', hint: 'максимальное качество, ~$0.15 за раунд' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', hint: 'баланс, ~$0.06 за раунд' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: 'дёшево и быстро, ~$0.03 за раунд' },
]

// Версия flex-appraiser-v1. Любая правка = новая версия (ТЗ §7.2).
const SYSTEM_PROMPT = `You are the appraiser engine of LarpBattle, a live 1v1 game where players show their belongings to a camera and the higher total market value wins.

Analyze one video frame. Identify each distinct physical item the player is deliberately showing off (watches, vehicles, electronics, clothing, sneakers, jewelry, furniture, instruments, etc.).

Rules:
- Name items as specifically as the image allows (brand + model when identifiable, e.g. "Rolex Submariner Date 126610LN"; otherwise a generic name like "Mechanical watch, steel").
- est_price_usd: current fair market value in USD of the actual item shown (used condition unless clearly new). Be consistent: the same item must always get a similar estimate. Consistency across players matters more than absolute precision.
- confidence: 0..1 — how certain you are about the identification AND the estimate together.
- is_screen_or_photo: true if the item appears on a display/monitor/phone screen, is a printed photo, poster, or any other reproduction rather than a real physical object. Look for moire patterns, pixel grids, screen bezels, glare, flat perspective, paper edges.
- Ignore: people, body parts, room background and fixtures not being showcased, the camera itself, food, packaging.
- Do not list the same item twice in one frame.
- If nothing showable is recognizable, return an empty items array.
- nsfw: true if the frame contains nudity, sexual content, or graphic violence.`

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'nsfw'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'category', 'est_price_usd', 'confidence', 'is_screen_or_photo'],
        properties: {
          name: { type: 'string' },
          category: {
            type: 'string',
            enum: ['watch', 'car', 'tech', 'fashion', 'jewelry', 'interior', 'other'],
          },
          est_price_usd: { type: 'number' },
          confidence: { type: 'number' },
          is_screen_or_photo: { type: 'boolean' },
        },
      },
    },
    nsfw: { type: 'boolean' },
  },
}

const AI_KEY = 'larpbattle.ai.v1'

export function getAiConfig() {
  let stored = {}
  try {
    stored = JSON.parse(localStorage.getItem(AI_KEY)) || {}
  } catch {
    /* повреждённый конфиг игнорируем */
  }
  return {
    apiKey: stored.apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY || '',
    model: stored.model || DEFAULT_MODEL,
  }
}

export function setAiConfig({ apiKey, model }) {
  const prev = (() => {
    try {
      return JSON.parse(localStorage.getItem(AI_KEY)) || {}
    } catch {
      return {}
    }
  })()
  localStorage.setItem(
    AI_KEY,
    JSON.stringify({
      ...prev,
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(model !== undefined ? { model } : {}),
    }),
  )
}

// Кадр → { items: [...], nsfw: boolean }
// Ключ уходит из браузера напрямую в Anthropic API — допустимо для этапа 2 (прототип,
// свой ключ). На этапе 4 вызовы переезжают на бэкенд.
export async function analyzeFrame({ base64, mediaType = 'image/jpeg' }) {
  const { apiKey, model } = getAiConfig()
  if (!apiKey) throw new VisionError('no_key', 'API-ключ не задан. Добавьте его в настройках.')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      output_config: {
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
        // effort снижает задержку, но не поддерживается на Haiku
        ...(model.includes('haiku') ? {} : { effort: 'low' }),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `Analyze this frame. [prompt:${PROMPT_VERSION}]` },
          ],
        },
      ],
    })
    if (response.stop_reason === 'refusal') return { items: [], nsfw: false }
    const text = response.content.find((b) => b.type === 'text')?.text
    return JSON.parse(text)
  } catch (e) {
    if (e instanceof VisionError) throw e
    if (e instanceof Anthropic.AuthenticationError)
      throw new VisionError('auth', 'Неверный API-ключ. Проверьте его в настройках.')
    if (e instanceof Anthropic.RateLimitError)
      throw new VisionError('rate_limit', 'Превышен лимит запросов API. Подождите минуту.')
    if (e instanceof Anthropic.APIConnectionError)
      throw new VisionError('network', 'Нет связи с API. Проверьте сеть.')
    throw new VisionError('api', `Ошибка анализа: ${e?.message || e}`)
  }
}

export class VisionError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
