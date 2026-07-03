import { dhash, hamming } from './phash.js'

// Захват кадров с видеопотока (ТЗ §7.1): тик каждые 500 мс, но на анализ уходит
// кадр только когда картинка стабильна ~1 сек И сцена отличается от последней
// проанализированной. Это держит стоимость: 5–20 кадров за раунд вместо 120.

const TICK_MS = 500
const STABLE_TICKS = 2 // ~1 сек стабильности
// Пороги для 256-битного dHash: сенсорный шум статичной сцены при даунсэмпле
// 17x16 — единицы бит, появление предмета в кадре — десятки
const STABLE_THRESHOLD = 10 // хэмминг-дистанция «кадр не меняется»
const SCENE_THRESHOLD = 14 // дистанция от последнего проанализированного — «новая сцена»
const MIN_SEND_INTERVAL_MS = 2500
const JPEG_WIDTH = 640
const JPEG_QUALITY = 0.75

export class FrameCapture {
  // onFrame({ base64, mediaType, hash }) вызывается для каждого кадра, ушедшего на анализ
  constructor(videoEl, { onFrame, maxFrames = 15 } = {}) {
    this.video = videoEl
    this.onFrame = onFrame
    this.maxFrames = maxFrames
    this.sentCount = 0
    this._timer = null
    this._prevHash = null
    this._lastAnalyzedHash = null
    this._stableTicks = 0
    this._lastSentAt = 0
    this._canvas = document.createElement('canvas')
  }

  start() {
    if (this._timer) return
    this._timer = setInterval(() => this._tick(), TICK_MS)
  }

  stop() {
    clearInterval(this._timer)
    this._timer = null
  }

  _tick() {
    const v = this.video
    if (!v || v.readyState < 2 || v.videoWidth === 0) return
    const hash = dhash(v)

    if (this._prevHash !== null && hamming(hash, this._prevHash) <= STABLE_THRESHOLD) {
      this._stableTicks++
    } else {
      this._stableTicks = 0
    }
    this._prevHash = hash

    const sceneChanged =
      this._lastAnalyzedHash === null || hamming(hash, this._lastAnalyzedHash) >= SCENE_THRESHOLD

    if (
      this._stableTicks >= STABLE_TICKS &&
      sceneChanged &&
      Date.now() - this._lastSentAt >= MIN_SEND_INTERVAL_MS &&
      this.sentCount < this.maxFrames
    ) {
      this._lastAnalyzedHash = hash
      this._lastSentAt = Date.now()
      this.sentCount++
      this.onFrame?.({ ...this._grabJpeg(), hash })
    }
  }

  _grabJpeg() {
    const v = this.video
    const scale = JPEG_WIDTH / v.videoWidth
    this._canvas.width = JPEG_WIDTH
    this._canvas.height = Math.round(v.videoHeight * scale)
    this._canvas.getContext('2d').drawImage(v, 0, 0, this._canvas.width, this._canvas.height)
    const dataUrl = this._canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    return { base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' }
  }
}
