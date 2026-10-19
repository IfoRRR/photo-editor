/** Client-side retouch helpers (no server, no ML). */

/**
 * Edge-aware soft skin: mix original with blurred copy,
 * keeping sharp edges (eyes/hair) more intact.
 */
export function softSkin(src, blurPx, amount) {
  const w = src.width
  const h = src.height
  const out = new OffscreenCanvas(w, h)
  const octx = out.getContext('2d', { willReadFrequently: true })
  octx.drawImage(src, 0, 0)

  if (amount <= 0.01 || blurPx <= 0) return out

  const blur = new OffscreenCanvas(w, h)
  const bctx = blur.getContext('2d', { willReadFrequently: true })
  bctx.filter = `blur(${blurPx}px)`
  bctx.drawImage(src, 0, 0)

  const a = octx.getImageData(0, 0, w, h)
  const b = bctx.getImageData(0, 0, w, h)
  const d = a.data
  const s = b.data
  const t = Math.min(1, Math.max(0, amount))

  for (let i = 0; i < d.length; i += 4) {
    const dr = Math.abs(d[i] - s[i])
    const dg = Math.abs(d[i + 1] - s[i + 1])
    const db = Math.abs(d[i + 2] - s[i + 2])
    const edge = Math.max(dr, dg, db)
    // high edge → keep original; low edge (skin texture) → use blur
    const mix = t * (1 - Math.min(1, edge / 28))
    d[i] = d[i] * (1 - mix) + s[i] * mix
    d[i + 1] = d[i + 1] * (1 - mix) + s[i + 1] * mix
    d[i + 2] = d[i + 2] * (1 - mix) + s[i + 2] * mix
  }
  octx.putImageData(a, 0, 0)
  return out
}

/** Color grade: brightness/contrast/warmth in one pass. */
export function grade(src, { brightness = 0, contrast = 0, warmth = 0 } = {}) {
  const w = src.width
  const h = src.height
  const out = new OffscreenCanvas(w, h)
  const ctx = out.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(src, 0, 0)
  if (!brightness && !contrast && !warmth) return out

  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const b = brightness / 100
  const c = contrast / 100
  const warm = warmth / 100
  const factor = (259 * (c * 255 + 255)) / (255 * (259 - c * 255))

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]
    let g = d[i + 1]
    let bl = d[i + 2]
    r = factor * (r - 128) + 128 + b * 255
    g = factor * (g - 128) + 128 + b * 255
    bl = factor * (bl - 128) + 128 + b * 255
    r += warm * 18
    bl -= warm * 14
    d[i] = clamp(r)
    d[i + 1] = clamp(g)
    d[i + 2] = clamp(bl)
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/**
 * Spot heal dab: local soft blur + slight de-red (acne-ish tones).
 * cx,cy in image pixels; radius in px.
 */
export function healDab(canvas, cx, cy, radius, strength = 0.65) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const w = canvas.width
  const h = canvas.height
  const r = Math.max(4, Math.round(radius))
  const x0 = Math.max(0, Math.floor(cx - r * 2))
  const y0 = Math.max(0, Math.floor(cy - r * 2))
  const x1 = Math.min(w, Math.ceil(cx + r * 2))
  const y1 = Math.min(h, Math.ceil(cy + r * 2))
  const bw = x1 - x0
  const bh = y1 - y0
  if (bw < 2 || bh < 2) return

  const patch = document.createElement('canvas')
  patch.width = bw
  patch.height = bh
  const pctx = patch.getContext('2d')
  pctx.filter = `blur(${Math.max(2, r * 0.45)}px)`
  pctx.drawImage(canvas, x0, y0, bw, bh, 0, 0, bw, bh)

  const orig = ctx.getImageData(x0, y0, bw, bh)
  const soft = pctx.getImageData(0, 0, bw, bh)
  const od = orig.data
  const sd = soft.data
  const str = Math.min(1, Math.max(0, strength))

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = (y * bw + x) * 4
      const dx = x0 + x - cx
      const dy = y0 + y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > r) continue
      const fall = (1 - dist / r) ** 1.6
      let mix = str * fall
      // de-emphasize reddish spots a bit more
      const redBias = Math.max(0, od[i] - (od[i + 1] + od[i + 2]) / 2) / 40
      mix = Math.min(1, mix * (1 + redBias * 0.5))
      od[i] = od[i] * (1 - mix) + sd[i] * mix
      od[i + 1] = od[i + 1] * (1 - mix) + sd[i + 1] * mix
      od[i + 2] = od[i + 2] * (1 - mix) + sd[i + 2] * mix
    }
  }
  ctx.putImageData(orig, x0, y0)
}

export function applyPipeline(sourceCanvas, opts) {
  let cur = softSkin(sourceCanvas, opts.blurPx ?? 4, opts.smooth ?? 0)
  cur = grade(cur, {
    brightness: opts.brightness ?? 0,
    contrast: opts.contrast ?? 0,
    warmth: opts.warmth ?? 0,
  })
  return cur
}

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** Tiny self-check for node (canvas mocked) / sanity of pure math helpers. */
export function selfcheck() {
  // clamp behavior via grade math constants
  if (clamp(-1) !== 0 || clamp(300) !== 255 || clamp(10) !== 10) {
    throw new Error('clamp failed')
  }
  return 'ok'
}

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('retouch')) {
  console.log(selfcheck())
}
