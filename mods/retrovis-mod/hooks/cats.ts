// The "cats" mode: a row of pixel cats dancing on a rooftop at night, with a
// moon, twinkling stars and a lit skyline behind them, RealPlayer's
// Annabel-the-Sheep style. Pure: palette indexes into `pix`, nothing else.
import type { VisState } from './vis.ts'

export const OUTFITS = ['plain', 'party hat', 'headphones', 'sunglasses', 'bow tie', 'scarf', 'crown'] as const

// Sprites, 12 wide and at most 12 rows; letters are color keys, `.` is transparent:
// B body, S stripes, P patches (a second marking color), I inner ear, E eyes, N nose, W muzzle, F feet.
// A shorter sprite is drawn lower down, so every one of them has its bottom row on the same floor row.
const CAT_DOWN = [
  '..B......B..',
  '.BIB....BIB.',
  '.BBBBBBPPPB.',
  'BBSBBBBPPSBB',
  'BBEBBBBBBEBB',
  'BBBBBNNBBBBB',
  '.BBBWWWWBBB.',
  '..BBBBBBBB..',
  '.BBBBBBPPBB.',
  '.BSBBSBPPSB.',
  '.BBBBBBBBBB.',
  '.FF..FF..FF.',
]
// the off-beat half of the bounce: the same head, the body squashed one row
// shorter and spilling out sideways, the feet still on the floor row
const CAT_SQUAT = [
  '..B......B..',
  '.BIB....BIB.',
  '.BBBBBBPPPB.',
  'BBSBBBBPPSBB',
  'BBEBBBBBBEBB',
  'BBBBBNNBBBBB',
  '.BBBWWWWBBB.',
  '..BBBBBBBB..',
  'BBBBBBBPPBBB',
  'BBSBBSBPPSBB',
  '.FF..FF..FF.',
]
// the look-away: CAT_DOWN's silhouette with nothing but fur on it (the tail
// mirrors to the other side, so the cat reads as turned and not just still)
const CAT_BACK = [
  '..B......B..',
  '.BBB....BBB.',
  '.BBBBBBPPPB.',
  'BBSBBBBPPSBB',
  'BBSBBBBBBSBB',
  'BBBBBBBBBBBB',
  '.BBBBBBBBBB.',
  '..BBBBBBBB..',
  '.BBBBBBPPBB.',
  '.BSBBSBPPSB.',
  '.BBBBBBBBBB.',
  '.FF..FF..FF.',
]
// idling: the same head two rows lower, haunches spread on the floor row and
// two front paws between them
const CAT_SIT = [
  '..B......B..',
  '.BIB....BIB.',
  '.BBBBBBPPPB.',
  'BBSBBBBPPSBB',
  'BBEBBBBBBEBB',
  'BBBBBNNBBBBB',
  '.BBBWWWWBBB.',
  '..BBBBBBBB..',
  '.BBBBBBPPBB.',
  'BBBB.FF.BBBB',
]
export const SPRITE_W = 12
export const SPRITE_H = 12
export const MOUSE_RUN = 2.5 // seconds a mouse takes to cross the roof
export const HIT = 1.5 // seconds a hit keeps a cat busy (vis.ts sets hold to this)
const JUMP_T = 0.8 // the jump itself is over in the first part of it
const SIT_AFTER = 10 // seconds of quiet before the cats sit down
const TAILS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[12, 10], [13, 9], [13, 8]],
  [[12, 10], [13, 10], [14, 9]],
]

// outfit overlays: [dx, dy, colorKey]; dy may be negative (above the head).
// Color keys (see OUTFIT_COLORS): R red, G gold, K near-black, M grey, D dark grey.
// K is nearly the night sky and nearly a black cat, so it is only ever a lens or a
// fill that sits inside a lighter frame; anything whose shape has to read against
// the sky or a dark breed (the headphone band and cups, the sunglasses frame) uses
// M, D or R instead.
type Px = readonly [number, number, string]
const OUTFIT_PX: Record<(typeof OUTFITS)[number], readonly Px[]> = {
  plain: [],
  'party hat': [
    [5, -3, 'G'], [6, -3, 'G'],
    [4, -2, 'R'], [5, -2, 'R'], [6, -2, 'R'], [7, -2, 'R'],
    [3, -1, 'G'], [4, -1, 'G'], [5, -1, 'G'], [6, -1, 'G'], [7, -1, 'G'], [8, -1, 'G'],
  ],
  headphones: [
    ...Array.from({ length: 10 }, (_, i): Px => [i + 1, -1, 'M']), // band, grey against the sky
    [-1, 3, 'R'], [0, 3, 'R'], [-1, 4, 'R'], [0, 4, 'R'], // ear cups, red against a dark breed
    [11, 3, 'R'], [12, 3, 'R'], [11, 4, 'R'], [12, 4, 'R'],
  ],
  // lenses dark, bridge and temples in a lighter frame so they read on a black cat
  sunglasses: [
    [1, 4, 'D'], [2, 4, 'K'], [3, 4, 'K'], [4, 4, 'K'], [5, 4, 'D'],
    [6, 4, 'D'], [7, 4, 'K'], [8, 4, 'K'], [9, 4, 'K'], [10, 4, 'D'],
  ],
  'bow tie': [[3, 7, 'R'], [4, 7, 'R'], [5, 7, 'G'], [6, 7, 'G'], [7, 7, 'R'], [8, 7, 'R']],
  scarf: [
    ...Array.from({ length: 10 }, (_, i): Px => [i + 1, 7, 'R']),
    [8, 8, 'R'], [9, 8, 'R'], [9, 9, 'R'],
  ],
  crown: [[3, -2, 'G'], [6, -2, 'G'], [9, -2, 'G'], ...Array.from({ length: 7 }, (_, i): Px => [i + 3, -1, 'G']), [6, -1, 'R']],
}

// how far the tallest outfit reaches above the head, plus the one pixel the beat
// bounce lifts it: the room a cat needs above SPRITE_H for every frame to fit
const OUTFIT_OVERHANG = Math.max(0, ...Object.values(OUTFIT_PX).flatMap(px => px.map(([, dy]) => -dy)))
const HEAD_ROOM = OUTFIT_OVERHANG + 1

// breeds: color per sprite key; ordered so neighbours contrast. One cat per breed, never repeated.
const ORANGE = 0xe8862a, DK_ORANGE = 0xb35a10, BLACK = 0x2b2b30, CHARCOAL = 0x3c3c44, WHITE = 0xf4f4f4, SNOW = 0xdcdcdc
const GREY = 0x8e93a0, DK_GREY = 0x5f6472, CREAM = 0xeadbc8, BROWN = 0x5a3a2a, PINK = 0xf4a6c0, ROSE = 0xe07090, PLUM = 0xb05070
const GREEN = 0x3cb44b, YELLOW = 0xf5d000, BLUE = 0x3a8dff
const BREEDS: ReadonlyArray<Record<string, number>> = [
  { B: ORANGE, S: DK_ORANGE, P: ORANGE, I: PINK, E: GREEN, N: ROSE, W: 0xfff1d6, F: ORANGE }, // orange tabby
  { B: WHITE, S: ORANGE, P: BLACK, I: PINK, E: YELLOW, N: ROSE, W: WHITE, F: WHITE }, // calico: white, orange and black
  { B: BLACK, S: BLACK, P: BLACK, I: PLUM, E: YELLOW, N: PLUM, W: CHARCOAL, F: BLACK }, // black
  { B: CREAM, S: BROWN, P: CREAM, I: BROWN, E: BLUE, N: BROWN, W: CREAM, F: BROWN }, // siamese: dark points
  { B: GREY, S: DK_GREY, P: GREY, I: PINK, E: GREEN, N: ROSE, W: 0xd8dae0, F: GREY }, // grey tabby
  { B: BLACK, S: BLACK, P: BLACK, I: PINK, E: GREEN, N: ROSE, W: WHITE, F: WHITE }, // tuxedo: white muzzle and feet
  { B: WHITE, S: SNOW, P: WHITE, I: PINK, E: BLUE, N: ROSE, W: WHITE, F: WHITE }, // white
  { B: BLACK, S: ORANGE, P: DK_ORANGE, I: PLUM, E: YELLOW, N: PLUM, W: CHARCOAL, F: BLACK }, // tortoiseshell
]
const OUTFIT_COLORS: Record<string, number> = { R: 0xe03030, G: 0xffc800, K: 0x141418, M: GREY, D: DK_GREY }

// one fixed palette for every cat color, so indexes are stable across frames
export const CAT_COLORS: number[] = []
const colorIndex = new Map<number, number>()
function intern(c: number): number {
  let i = colorIndex.get(c)
  if (i === undefined) { i = CAT_COLORS.length; CAT_COLORS.push(c); colorIndex.set(c, i) }
  return i
}
const BREED_IDX = BREEDS.map(b => { const m: Record<string, number> = {}; for (const k in b) m[k] = intern(b[k]); return m })
const OUTFIT_IDX: Record<string, number> = {}
for (const k in OUTFIT_COLORS) OUTFIT_IDX[k] = intern(OUTFIT_COLORS[k])

/** The palette index of one of the cat colors (they double as star, moon and window colors). */
export function catColor(c: number): number {
  const i = colorIndex.get(c)
  if (i === undefined) throw new Error('retrovis: not a cat color')
  return i
}
const STAR = catColor(0xf4f4f4), STAR_DIM = catColor(0xdcdcdc), MOON = catColor(0xfff1d6), WINDOW = catColor(0xf5d000)
const MOUSE = catColor(GREY), MOUSE_TAIL = catColor(DK_GREY)

/** A stable 0..1 hash of two integers: the one source of randomness in here. */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a * 73856093 ^ b * 19349663, 0x9e3779b1)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

export type CatsPalette = { bg: number; floorDark: number; floorLit: number; cats: number }

/** Draws the rooftop, the sky and the cats into `pix` (palette indexes), given where each palette block starts. */
export function drawCats(s: VisState, pix: Uint8Array, W: number, H: number, pal: CatsPalette, bgColors: number): void {
  const floorY = H - 1
  // sky: a vertical gradient, darkest at the top (bg 1..); bg 0 is the skyline's silhouette
  const skyH = Math.max(1, floorY)
  for (let y = 0; y < floorY; y++) {
    const band = 1 + Math.min(bgColors - 2, Math.floor((y / skyH) * (bgColors - 1)))
    for (let x = 0; x < W; x++) pix[y * W + x] = pal.bg + band
  }
  // stars: fixed positions in the upper sky, twinkling on their own clocks and brighter with the energy
  const nStars = Math.floor((W * skyH) / 28)
  for (let k = 0; k < nStars; k++) {
    const x = Math.floor(hash2(k, 1) * W), y = Math.floor(hash2(k, 2) * skyH * 0.7)
    const tw = Math.sin(s.t * (1.5 + hash2(k, 3) * 2) + hash2(k, 4) * 6.28)
    if (tw > 0.75 - s.level) pix[y * W + x] = pal.cats + (tw > 0.9 ? STAR : STAR_DIM)
  }
  // moon: a disc at the right edge, in the strip the cats leave free, centred on a pixel
  // (no half offset) so both axes are symmetric. A half-block pixel is a little taller than
  // it is wide on most terminal fonts once line spacing is counted, so the disc is stretched
  // sideways by MOON_ASPECT: 9 wide by 7 tall at full height, rows 5/7/9/9/9/7/5.
  const MOON_W = 12, MOON_ASPECT = 1.2
  const mx = W - MOON_W / 2, mr = Math.max(1.5, Math.min(3.5, skyH / 4)), my = Math.floor(mr)
  const mrx = mr * MOON_ASPECT
  for (let y = 0; y < skyH; y++) for (let x = Math.max(0, W - MOON_W); x < W; x++) {
    const dx = x - mx, dy = y - my
    if ((dx * dx) / (mrx * mrx) + (dy * dy) / (mr * mr) <= 1) pix[y * W + x] = pal.cats + MOON
  }
  // skyline: building silhouettes of varied height, with windows that light up with the energy
  const maxBuild = Math.max(2, Math.floor(skyH * 0.45))
  for (let x = 0; x < W; x++) {
    const b = Math.floor(x / 7)
    const h = 1 + Math.floor(hash2(b, 9) * maxBuild)
    for (let y = floorY - h; y < floorY; y++) {
      const wx = x % 7, wy = (floorY - 1 - y)
      const window = wx % 3 === 1 && wy % 2 === 0 && wy < h - 1
      const lit = window && hash2(x, y) < 0.15 + 0.7 * s.level
      pix[y * W + x] = lit ? pal.cats + WINDOW : pal.bg
    }
  }
  // one cat per breed, as many as fit; on a wide band they spread out evenly instead of repeating
  const minSpacing = SPRITE_W + 4
  const room = W > 2 * minSpacing + MOON_W ? W - MOON_W : W // leave the moon's strip free when there is room
  const n = Math.max(1, Math.min(BREED_IDX.length, Math.floor(room / minSpacing)))
  const spacing = Math.floor(room / n)
  const margin = Math.floor((room - n * spacing) / 2) + Math.floor((spacing - SPRITE_W - 2) / 2)
  const outfit = OUTFIT_PX[OUTFITS[s.outfit % OUTFITS.length]]
  // the cats keep their feet on the roof while the band is tall enough for them.
  // The groove never stops while a turn runs: the whole row bounces on every beat,
  // lifting a pixel on one beat and squatting on the next, necks sway in a slow
  // wave, eyes blink and tails swing. A cat whose slice was hit does one of two
  // special moves on top of that, a jump or a look-away; left alone long enough
  // they all sit down.
  const bounce = s.working && s.beat < 0.16
  const squat = bounce && s.beats % 2 === 1
  const hop = bounce && s.beats % 2 === 0 ? 1 : 0
  const sitting = s.idle > SIT_AFTER
  // a mouse crosses right to left; while it is out there every head follows it
  const mouseX = s.mouse >= 0 ? Math.round(W + 3 - (s.mouse / MOUSE_RUN) * (W + 6)) : undefined
  const NECK = 7 // the last head row: head and neck sway, the body below them does not
  for (let i = 0; i < n; i++) {
    const breed = BREED_IDX[i]
    // each cat listens to its own slice of the spectrum, so every hit lands on some cat
    const from = Math.floor((i * s.bands.length) / n), to = Math.floor(((i + 1) * s.bands.length) / n)
    let hold = 0
    for (let b = from; b < to; b++) hold = Math.max(hold, s.hold[b])
    const pj = Math.min(1, (HIT - hold) / JUMP_T) // 0..1 through the jump, done well before the hit ends
    const jump = hold > 0 && hash2(i, s.hits) < 0.5 // the other half turn away instead
    const turn = hold > 0 && !jump && hold < HIT - 0.1 && hold > 0.1 // back turned for about 1.3 s
    const x0 = margin + i * spacing + 1
    // head first: on a tall band the feet land on the roof, on a short one the cat sinks
    // behind the parapet (the roof is drawn last) so the head and its outfit still fit
    const y0 = Math.max(floorY - SPRITE_H, HEAD_ROOM)
    const put = (dx: number, dy: number, idx: number) => {
      const x = x0 + dx, y = y0 + dy
      if (x >= 0 && x < W && y >= 0 && y < H) pix[y * W + x] = pal.cats + idx
    }
    // the jump is a parabola, clamped (with the beat's own pixel counted in) so a
    // head and its hat never clip off a short band
    const jumpMax = Math.max(0, Math.min(3, y0 - OUTFIT_OVERHANG - hop))
    const lift = hop + (jump ? Math.round(jumpMax * 4 * pj * (1 - pj)) : 0)
    const sprite = sitting ? CAT_SIT : turn ? CAT_BACK : squat ? CAT_SQUAT : CAT_DOWN
    // every sprite's bottom row lands on the same floor row; a turned cat has no
    // squat of its own, so it takes the off-beat as a one-pixel dip instead
    const base = SPRITE_H - sprite.length + (turn && squat ? 1 : 0)
    const sway = mouseX !== undefined ? Math.sign(mouseX - (x0 + SPRITE_W / 2))
      : Math.round(Math.sin(s.t * 1.5 + i * 1.1))
    const blink = (s.t + i * 0.7) % 4.3 < 0.12 // closed eyes are body-colored
    for (let r = 0; r < sprite.length; r++) {
      const row = sprite[r]
      const shift = r <= NECK ? sway : 0
      for (let c = 0; c < SPRITE_W; c++) {
        const key = row[c]
        if (key === '.') continue
        put(c + shift, base + r - lift, breed[key === 'E' && blink ? 'B' : key])
      }
    }
    for (const [dx, dy] of TAILS[Math.sin(s.t * 2 + i) > 0 ? 0 : 1]) put(turn ? SPRITE_W - 1 - dx : dx, base + dy - lift, breed.B)
    // a turned cat keeps whatever sits above its head and loses what sat on its face
    for (const [dx, dy, k] of outfit) if (!turn || dy < 0) put(dx + sway, base + dy - lift, OUTFIT_IDX[k])
  }

  // the mouse, drawn after the cats so it passes in front of their feet
  if (mouseX !== undefined) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 4; dx++) {
      const x = mouseX + dx, y = floorY - 2 + dy
      if (x >= 0 && x < W && y >= 0) pix[y * W + x] = pal.cats + MOUSE
    }
    const tx = mouseX + 4 // the tail trails behind it, to the right
    if (tx >= 0 && tx < W && floorY >= 1) pix[(floorY - 1) * W + tx] = pal.cats + MOUSE_TAIL
  }

  // roof: tiles in two shades, alternating every 4 px. Drawn last, so it hides
  // whatever a sunk cat put on the floor row: they stand behind a parapet.
  for (let x = 0; x < W; x++) pix[floorY * W + x] = Math.floor(x / 4) % 2 === 0 ? pal.floorLit : pal.floorDark
}
