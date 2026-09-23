// Pure visualizer state and frame renderer: no `$`, no DOM, so it can be
// unit-tested outside the engine. Everything the engine sees is one base64
// Raster (`renderFrame`); everything that drives it is `kick` and `step`.

import { CAT_COLORS, HIT, MOUSE_RUN, OUTFITS, drawCats, hash2 } from './cats.ts'

export const N_BANDS = 64
export const MODES = ['plasma', 'cats'] as const
export { OUTFITS }
const HALF_BLOCK = 0x2580 // ▀: fg paints the top pixel, bg the bottom
const PLASMA_COLORS = 24 // palette entries 0..23 cycle the hue wheel
const BAR_COLORS = 7 // palette entries 24..30, the theme's gradient bottom -> top
const PEAK_COLOR = 31 // white
const PALETTE_SIZE = 32 // 32 x 32 = 1024 fg/bg pairs, the Raster's palette limit

export type Kind = 'prompt' | 'tool' | 'turn' | 'done'

/** Equalizer color themes: RGB stops from the bar's foot to its tip. */
export const THEMES: ReadonlyArray<{ name: string; stops: readonly number[] }> = [
  { name: 'classic', stops: [0x00e000, 0xf0f000, 0xff2020] },
  { name: 'fire', stops: [0x600000, 0xff4000, 0xffc000, 0xffffa0] },
  { name: 'ice', stops: [0x0030a0, 0x00a0ff, 0xa0f0ff, 0xffffff] },
  { name: 'neon', stops: [0xff00a0, 0x8000ff, 0x00e0ff] },
  { name: 'lime', stops: [0x104000, 0x40c000, 0xc0ff40] },
  { name: 'mono', stops: [0x404040, 0xa0a0a0, 0xffffff] },
]

export type VisState = {
  bands: Float64Array // 0..1 bar energy
  peaks: Float64Array // 0..1 peak-hold markers
  hold: Float64Array // seconds a band still counts as "hit" (a cat whose slice holds one does a special move)
  phase: Float64Array // per-band phase so the "music" is not in lockstep
  level: number // 0..1 global energy, drives speed and brightness
  t: number // plasma time (seconds, scaled by energy)
  hue: number // 0..1 palette rotation
  beat: number // seconds since the last beat while working
  beats: number // beats counted so far: the cats bounce up on even ones, squat on odd ones
  hits: number // events seen this session
  mouse: number // seconds since a mouse walked onto the roof, or -1 when there is none
  idle: number // seconds since the last event: the cats sit down
  working: boolean
  track: string // what the status row shows as "now playing"
  theme: number // index into THEMES (plasma mode's bar colors)
  outfit: number // index into OUTFITS (cats mode's costume)
  mode: number // index into MODES
}

export function createState(): VisState {
  const phase = new Float64Array(N_BANDS)
  for (let i = 0; i < N_BANDS; i++) phase[i] = (i * 0.618033988749895) % 1 * Math.PI * 2
  return {
    bands: new Float64Array(N_BANDS),
    peaks: new Float64Array(N_BANDS),
    hold: new Float64Array(N_BANDS),
    phase,
    level: 0,
    t: 0,
    hue: 0,
    beat: 0,
    beats: 0,
    hits: 0,
    mouse: -1,
    idle: 0,
    working: false,
    track: 'idle',
    theme: 0,
    outfit: 0,
    mode: 0,
  }
}

function hashName(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function bump(bands: Float64Array, center: number, width: number, amp: number): void {
  for (let i = 0; i < N_BANDS; i++) {
    const d = (i - center) / width
    const v = amp * Math.exp(-d * d)
    if (v > bands[i]) bands[i] = Math.min(1, v)
  }
}

/** A session event lands: a kick to the global level and to some bands.
 * Both prompt and tool events pick a random band, seeded deterministically by
 * the event counter, across the whole spectrum, so every cat gets hit over time. */
export function kick(s: VisState, kind: Kind, tool?: string): void {
  s.idle = 0 // anything at all wakes the cats up
  switch (kind) {
    case 'prompt': {
      s.hits += 1
      s.level = Math.min(1, s.level + 0.5)
      const at = Math.floor(hash2(s.hits, 11) * N_BANDS)   // any band, so any cat
      bump(s.bands, at, N_BANDS * 0.18, 0.9)
      s.hold[at] = HIT
      s.track = 'prompt'
      break
    }
    case 'tool': {
      const name = tool ?? 'tool'
      s.hits += 1
      s.level = Math.min(1, s.level + 0.3)
      const center = Math.floor(hash2(s.hits, 13) * N_BANDS)   // any band, so any cat
      bump(s.bands, center, 4 + (hashName(name + '#') % 5), 0.95)
      s.hold[center] = HIT
      s.track = name
      break
    }
    case 'turn':
      s.level = Math.min(1, s.level + 0.2)
      s.working = true
      break
    case 'done':
      s.level = Math.min(1, s.level + 0.4)
      for (let i = 0; i < N_BANDS; i++) s.bands[i] = Math.max(s.bands[i], 0.55 + 0.35 * Math.sin(i * 0.3))
      s.hold.fill(HIT) // every cat cheers
      if (hash2(7, s.hits) < 0.5) s.mouse = 0 // and half the time a mouse turns up
      s.working = false
      s.track = 'idle'
      break
  }
}

/** Advance the animation by `dt` seconds. */
export function step(s: VisState, dt: number): void {
  const baseline = s.working ? 0.32 : 0.05
  s.level += (baseline - s.level) * (1 - Math.exp(-dt / 1.2))
  s.t += dt * (0.35 + 1.8 * s.level)
  s.hue = (s.hue + dt * (0.02 + 0.08 * s.level)) % 1

  // a beat every half second while working, so the bars dance between events
  let pulse = 0
  if (s.working) {
    s.beat += dt
    if (s.beat >= 0.5) { s.beat -= 0.5; s.beats += 1 }
    pulse = Math.exp(-s.beat * 9) * (0.35 + 0.4 * s.level)
  }
  s.idle = s.working ? 0 : s.idle + dt
  if (s.mouse >= 0) {
    s.mouse += dt
    if (s.mouse > MOUSE_RUN) s.mouse = -1 // it made it off the far end
  }

  const attack = 1 - Math.exp(-dt / 0.05)
  const release = 1 - Math.exp(-dt / 0.28)
  for (let i = 0; i < N_BANDS; i++) {
    const wobble = 0.5 + 0.5 * Math.sin(s.t * 2.1 + s.phase[i]) * Math.sin(s.t * 0.7 + i * 0.21)
    const target = Math.min(1, s.level * (0.25 + 0.45 * wobble) + pulse * wobble)
    const b = s.bands[i]
    s.bands[i] = Math.min(1, target > b ? b + (target - b) * attack : b + (target - b) * release)
    // peaks hold for a moment then fall
    if (s.bands[i] >= s.peaks[i]) s.peaks[i] = s.bands[i]
    else s.peaks[i] = Math.max(s.bands[i], s.peaks[i] - dt * 0.35)
    s.hold[i] = Math.max(0, s.hold[i] - dt)
  }
}

function hsv(h: number, sat: number, val: number): number {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = val * (1 - sat), q = val * (1 - f * sat), t = val * (1 - (1 - f) * sat)
  let r: number, g: number, b: number
  switch (i % 6) {
    case 0: r = val; g = t; b = p; break
    case 1: r = q; g = val; b = p; break
    case 2: r = p; g = val; b = t; break
    case 3: r = p; g = q; b = val; break
    case 4: r = t; g = p; b = val; break
    default: r = val; g = p; b = q
  }
  return ((r * 255) << 16) | ((g * 255) << 8) | (b * 255)
}

function lerpStops(stops: readonly number[], f: number): number {
  const seg = f * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(seg))
  const t = seg - i
  const a = stops[i], b = stops[i + 1]
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/** What the left picker chooses in the current mode, and every value it can take. */
export function leftPicker(s: VisState): { label: string; values: readonly string[]; index: number } {
  return MODES[s.mode] === 'cats'
    ? { label: 'outfit', values: OUTFITS, index: s.outfit }
    : { label: 'color', values: THEMES.map(t => t.name), index: s.theme }
}
export function cycleLeft(s: VisState, by: number): void {
  if (MODES[s.mode] === 'cats') s.outfit = (s.outfit + by + OUTFITS.length) % OUTFITS.length
  else s.theme = (s.theme + by + THEMES.length) % THEMES.length
}
export function cycleMode(s: VisState, by: number): void {
  s.mode = (s.mode + by + MODES.length) % MODES.length
}

/** The bar color at `f` (0 foot, 1 tip) of the current theme, as `#rrggbb`. */
export function themeColor(s: VisState, f: number): string {
  return '#' + lerpStops(THEMES[s.theme % THEMES.length].stops, f).toString(16).padStart(6, '0')
}

/** The 32-entry palette for this frame: plasma hues dimmed by energy, bar gradient, peak white. */
function palette(s: VisState): Uint32Array {
  const pal = new Uint32Array(PALETTE_SIZE)
  const val = 0.22 + 0.6 * s.level
  for (let i = 0; i < PLASMA_COLORS; i++) pal[i] = hsv((i / PLASMA_COLORS + s.hue) % 1, 0.85, val)
  const stops = THEMES[s.theme % THEMES.length].stops
  for (let i = 0; i < BAR_COLORS; i++) pal[PLASMA_COLORS + i] = lerpStops(stops, i / (BAR_COLORS - 1))
  pal[PEAK_COLOR] = 0xffffff
  return pal
}

function toBase64(bytes: Uint8Array): string {
  const anyBytes = bytes as unknown as { toBase64?: () => string }
  if (typeof anyBytes.toBase64 === 'function') return anyBytes.toBase64()
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

const CATS_BG_COLORS = 8
const CATS_PAL = { bg: 0, floorDark: CATS_BG_COLORS, floorLit: CATS_BG_COLORS + 1, cats: CATS_BG_COLORS + 2 }
if (CATS_PAL.cats + CAT_COLORS.length > PALETTE_SIZE) throw new Error('retrovis: cats palette overflows 32 colors')

/** The cats-mode palette: the skyline silhouette, a night-sky gradient, two roof tiles, then every cat color. */
function catsPalette(s: VisState): Uint32Array {
  const pal = new Uint32Array(PALETTE_SIZE)
  pal[0] = 0x07060e // buildings
  const lift = 0.25 * s.level // the sky warms a little with the energy
  for (let i = 1; i < CATS_BG_COLORS; i++) {
    const f = (i - 1) / (CATS_BG_COLORS - 2) // 0 top .. 1 horizon
    pal[i] = lerpStops([0x05041a, 0x140c3a, 0x2a1450, 0x4a1e5a], Math.min(1, f + lift * 0.4))
  }
  const pulse = s.working ? Math.exp(-s.beat * 9) * 0.5 : 0
  pal[CATS_PAL.floorDark] = 0x2a1a14
  pal[CATS_PAL.floorLit] = lerpStops([0x4a2a1c, 0x8a4a2c], Math.min(1, s.level * 0.6 + pulse))
  for (let i = 0; i < CAT_COLORS.length; i++) pal[CATS_PAL.cats + i] = CAT_COLORS[i]
  return pal
}

/** One frame as Raster `cells`: `cols` x `rows` cells, 2 pixels per cell. */
export function renderFrame(s: VisState, cols: number, rows: number): string {
  const W = cols, H = rows * 2
  const pix = new Uint8Array(W * H) // palette index per pixel
  const pal = MODES[s.mode] === 'cats' ? catsPalette(s) : palette(s)
  if (MODES[s.mode] === 'cats') {
    drawCats(s, pix, W, H, CATS_PAL, CATS_BG_COLORS)
    return pack(pix, pal, W, rows)
  }

  // plasma: four moving sines, quantized to the hue ring
  const cx = W * (0.5 + 0.35 * Math.sin(s.t * 0.23)), cy = H * (0.5 + 0.4 * Math.cos(s.t * 0.17))
  for (let y = 0; y < H; y++) {
    const sy = Math.sin(y * 0.22 - s.t * 0.6)
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = (y - cy) * 2
      const v = Math.sin(x * 0.09 + s.t * 0.9) + sy + Math.sin(x * 0.06 + y * 0.13 + s.t * 0.4) + Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.07 - s.t * 1.1)
      pix[y * W + x] = Math.floor(((v + 4) / 8) * PLASMA_COLORS) % PLASMA_COLORS
    }
  }

  // bars: width 2, gap 1, spread over the band's 64 energies
  const nBars = Math.max(1, Math.floor((W + 1) / 3))
  for (let b = 0; b < nBars; b++) {
    const band = Math.floor((b * N_BANDS) / nBars)
    const h = Math.round(s.bands[band] * H)
    const peak = Math.round(s.peaks[band] * H)
    const x0 = b * 3
    for (let k = 0; k < 2 && x0 + k < W; k++) {
      const x = x0 + k
      for (let yUp = 0; yUp < h; yUp++) {
        const y = H - 1 - yUp
        pix[y * W + x] = PLASMA_COLORS + Math.min(BAR_COLORS - 1, Math.floor((yUp / H) * BAR_COLORS))
      }
      if (peak > 0 && peak > h) pix[(H - peak) * W + x] = PEAK_COLOR
    }
  }

  return pack(pix, pal, W, rows)
}

/** Packs palette-indexed pixels (2 per cell, top and bottom) into Raster cells. */
function pack(pix: Uint8Array, pal: Uint32Array, W: number, rows: number): string {
  const words = new Uint32Array(W * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < W; c++) {
      const o = (r * W + c) * 3
      words[o] = HALF_BLOCK
      words[o + 1] = pal[pix[(2 * r) * W + c]]
      words[o + 2] = pal[pix[(2 * r + 1) * W + c]]
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}
