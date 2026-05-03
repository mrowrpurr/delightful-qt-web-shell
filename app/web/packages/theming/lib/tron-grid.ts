/**
 * Animated Tron perspective grid rendered on a <canvas>.
 * Lines are drawn in 2D with baked-in perspective math — no CSS 3D transforms,
 * so they stay pixel-sharp at any resolution.
 */

const COLOR = 'rgba(26,255,236,0.19)'
const LINE_WIDTH = 2.5
const VANISH_Y_RATIO = 0.42
const CLIP_Y_RATIO = 0.45
const VANISH_X_RATIO = 0.5
const H_LINE_COUNT = 22
const V_LINE_COUNT = 40
const SCROLL_SPEED = 0.55
const FADE_RATIO = 0.12

const V_BEAM_DUR = 3
const BEAM_LENGTH = 0.12
const BEAM_BRIGHTNESS = 0.85
const BEAM_WIDTH_MULT = 1.5
const V_BEAM_LINES = [4, 10, 16, 20, 24, 30, 36]

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let animId = 0
let startTime = 0
let resizeHandler: (() => void) | null = null

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function perspY(t: number, vanishY: number, bottomY: number): number {
  return lerp(vanishY, bottomY, t * t)
}

function draw(timestamp: number) {
  if (!canvas || !ctx) return
  const w = canvas.width
  const h = canvas.height
  const dpr = window.devicePixelRatio || 1

  ctx.clearRect(0, 0, w, h)

  const vanishY = h * VANISH_Y_RATIO
  const clipY = h * CLIP_Y_RATIO
  const bottomY = h * 1.1
  const vanishX = w * VANISH_X_RATIO
  const leftEdgeX = -w * 1.5
  const rightEdgeX = w * 2.5

  const elapsed = (timestamp - startTime) / 1000
  const offset = (elapsed * SCROLL_SPEED) % 1
  const vBeamPos = (elapsed % V_BEAM_DUR) / V_BEAM_DUR

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, clipY, w, h - clipY)
  ctx.clip()

  ctx.strokeStyle = COLOR
  ctx.lineWidth = LINE_WIDTH * dpr
  ctx.beginPath()
  for (let i = -1; i <= H_LINE_COUNT + 1; i++) {
    const t = (i + offset) / H_LINE_COUNT
    if (t < 0) continue
    const y = perspY(t, vanishY, bottomY)
    if (y > h || y < clipY) continue
    const depth = (y - vanishY) / (bottomY - vanishY)
    const x1 = lerp(vanishX, leftEdgeX, depth)
    const x2 = lerp(vanishX, rightEdgeX, depth)
    ctx.moveTo(x1, y)
    ctx.lineTo(x2, y)
  }
  ctx.stroke()

  ctx.beginPath()
  for (let i = 0; i <= V_LINE_COUNT; i++) {
    const ratio = i / V_LINE_COUNT
    const bx = lerp(-w * 1.5, w * 2.5, ratio)
    ctx.moveTo(vanishX, vanishY)
    ctx.lineTo(bx, bottomY)
  }
  ctx.stroke()

  ctx.lineWidth = LINE_WIDTH * BEAM_WIDTH_MULT * dpr
  for (const lineIdx of V_BEAM_LINES) {
    if (lineIdx > V_LINE_COUNT) continue
    const ratio = lineIdx / V_LINE_COUNT
    const bx = lerp(-w * 1.5, w * 2.5, ratio)
    const t0 = Math.max(0, vBeamPos - BEAM_LENGTH * 0.5)
    const t1 = Math.min(1, vBeamPos + BEAM_LENGTH * 0.5)
    const sx = lerp(vanishX, bx, t0)
    const sy = lerp(vanishY, bottomY, t0)
    const ex = lerp(vanishX, bx, t1)
    const ey = lerp(vanishY, bottomY, t1)

    const grad = ctx.createLinearGradient(sx, sy, ex, ey)
    grad.addColorStop(0, 'rgba(26,255,236,0)')
    grad.addColorStop(0.5, `rgba(26,255,236,${BEAM_BRIGHTNESS * 0.85})`)
    grad.addColorStop(1, 'rgba(26,255,236,0)')

    ctx.strokeStyle = grad
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
  }

  const fadeH = (bottomY - clipY) * FADE_RATIO
  const fadeGrad = ctx.createLinearGradient(0, clipY, 0, clipY + fadeH)
  fadeGrad.addColorStop(0, 'rgba(2,6,15,1)')
  fadeGrad.addColorStop(1, 'rgba(2,6,15,0)')
  ctx.fillStyle = fadeGrad
  ctx.fillRect(0, clipY, w, fadeH)

  ctx.restore()
  animId = requestAnimationFrame(draw)
}

export function startTronGrid(): HTMLCanvasElement {
  if (canvas) return canvas

  canvas = document.createElement('canvas')
  canvas.id = 'tron-moving-grid'
  canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;width:100%;height:100%;'

  const resize = () => {
    const dpr = window.devicePixelRatio || 1
    canvas!.width = window.innerWidth * dpr
    canvas!.height = window.innerHeight * dpr
  }
  resizeHandler = resize
  resize()
  window.addEventListener('resize', resize)

  ctx = canvas.getContext('2d')
  startTime = performance.now()
  animId = requestAnimationFrame(draw)

  return canvas
}

export function stopTronGrid() {
  if (animId) cancelAnimationFrame(animId)
  animId = 0
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  resizeHandler = null
  canvas?.remove()
  canvas = null
  ctx = null
}
