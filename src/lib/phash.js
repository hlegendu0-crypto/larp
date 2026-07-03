// Перцептивный хэш кадра (dHash, 256 бит) — ТЗ §7.1.
// Кадр уменьшается до 17x16 в оттенках серого; бит = яркость пикселя выше соседа
// справа. 256 бит (вместо классических 64) дают достаточную чувствительность,
// чтобы заметить предмет, занимающий и небольшую часть кадра.

const W = 17
const H = 16

const hashCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
if (hashCanvas) {
  hashCanvas.width = W
  hashCanvas.height = H
}

// source — <video> или <canvas>
export function dhash(source) {
  const ctx = hashCanvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, W, H)
  const { data } = ctx.getImageData(0, 0, W, H)
  const lum = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) {
    lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  let hash = 0n
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      hash <<= 1n
      if (lum[y * W + x] > lum[y * W + x + 1]) hash |= 1n
    }
  }
  return hash
}

export function hamming(a, b) {
  let x = a ^ b
  let count = 0
  while (x) {
    count += Number(x & 1n)
    x >>= 1n
  }
  return count
}
