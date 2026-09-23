/* @jsx h */
import { test, expect, mock } from 'claude-code/testing'
import { createState, MODES } from './vis.ts'
import type { VisState } from './vis.ts'
import { CAT_COLORS, HIT, OUTFITS, SPRITE_H, drawCats, hash2 } from './cats.ts'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 }, view: {} },
} as const

test('draws a Raster band and a status row above the prompt', async ($, on) => {
  on('ui.render', async (e$, e) => { const { Text } = e$.ui.resolve(e); return <Text>engine</Text> })
  const ui = await $.ui.mount({ plugin: 'retrovis-mod', surface: 'terminal', ...BAND } as any)
  const raster = await ui.find({ type: 'Raster', key: 'vis' })
  expect(raster).toBeDefined()
  expect(raster?.props.columns).toBe(100)
  expect(raster?.props.rows).toBe(8)
  expect(typeof raster?.props.cells).toBe('string')
  expect(await ui.find({ type: 'Text', text: /idle/ })).toBeDefined()
  await ui.unmount()
})

test('yields to a survey', async ($, on) => {
  on('ui.render', async (e$, e) => { const { Text } = e$.ui.resolve(e); return <Text>engine</Text> })
  const ui = await $.ui.mount({ plugin: 'retrovis-mod', surface: 'terminal', ...BAND, props: { ...BAND.props, hasSurvey: true } } as any)
  expect(await ui.find({ type: 'Raster', key: 'vis' })).toBeUndefined()
  await ui.unmount()
})

test('the pickers cycle color, mode, and outfit once in cats mode', async ($, on) => {
  mock.store(on)
  on('ui.render', async (e$, e) => { const { Text } = e$.ui.resolve(e); return <Text>engine</Text> })
  const ui = await $.ui.mount({ plugin: 'retrovis-mod', surface: 'terminal', ...BAND } as any)
  expect((await ui.find({ type: 'Button', key: 'left' }))?.props.label).toMatch(/classic/)
  expect(await ui.find({ type: 'Text', text: /color:/ })).toBeDefined()
  await ui.press({ key: 'left' })
  expect((await ui.find({ type: 'Button', key: 'left' }))?.props.label).toMatch(/fire/)
  await ui.press({ key: 'mode' })
  expect((await ui.find({ type: 'Button', key: 'mode' }))?.props.label).toMatch(/cats/)
  expect(await ui.find({ type: 'Text', text: /outfit:/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'left' }))?.props.label).toMatch(/plain/)
  await ui.press({ key: 'left' })
  expect((await ui.find({ type: 'Button', key: 'left' }))?.props.label).toMatch(/party hat/)
  expect(typeof (await ui.find({ type: 'Raster', key: 'vis' }))?.props.cells).toBe('string')
  await ui.unmount()
})

// --- cats mode, drawn straight into a buffer: no engine, no mounting ---

// the palette layout renderFrame gives drawCats: 8 sky/skyline colors, two roof
// tiles, then the cat colors
const CATS_BG_COLORS = 8
const CATS_PAL = { bg: 0, floorDark: 8, floorLit: 9, cats: 10 }
const HAT_YELLOW = 0xffc800 // the party hat's 'G'
const OUTFIT_BLACK = 0x141418 // 'K', all but invisible against the night sky
const HEADPHONE_GREY = 0x8e93a0
const TABBY_FEET = 0xe8862a // the first cat (orange tabby) is this color all over, feet included
const TABBY_EYE = 0x3cb44b // the orange tabby's eye color (GREEN in cats.ts)
const MOON_CREAM = 0xfff1d6
const MOUSE_GREY = 0x8e93a0 // the mouse's body; no cat on a 40-wide band wears it
const CAT0 = 20 // on a 40-wide band the tabby is the only cat left of this column

/** One cats frame, W = 40; `bobbed` takes it mid-beat, the frame that reaches highest. */
function catsFrame(H: number, outfit: (typeof OUTFITS)[number], bobbed = false, tweak?: (s: VisState) => void): { pix: Uint8Array; W: number; H: number } {
  const W = 40
  const s = createState()
  s.mode = MODES.indexOf('cats')
  s.outfit = OUTFITS.indexOf(outfit)
  s.working = bobbed // working with beat 0 is a beat, and beat 0 is even: the whole row is up one pixel
  tweak?.(s)
  const pix = new Uint8Array(W * H)
  drawCats(s, pix, W, H, CATS_PAL, CATS_BG_COLORS)
  return { pix, W, H }
}

/** The colors of the cat-palette pixels in one row (sky and roof indexes dropped), up to column `until`. */
function catColorsInRow(pix: Uint8Array, W: number, y: number, until = W): number[] {
  const out: number[] = []
  for (let x = 0; x < until; x++) {
    const idx = pix[y * W + x]
    if (idx >= CATS_PAL.cats) out.push(CAT_COLORS[idx - CATS_PAL.cats])
  }
  return out
}

test('cats keep their heads on a short band', async () => {
  const { pix, W, H } = catsFrame(10, 'party hat', true) // 5 terminal rows: shorter than a cat
  expect(catColorsInRow(pix, W, 0)).toContain(HAT_YELLOW) // the hat's tip survived
  const roof: number[] = []
  for (let x = 0; x < W; x++) roof.push(pix[(H - 1) * W + x])
  expect(roof.every(i => i === CATS_PAL.floorDark || i === CATS_PAL.floorLit)).toBe(true)
})

test('cats stand on the roof on a tall band', async () => {
  const { pix, W, H } = catsFrame(20, 'party hat')
  expect(catColorsInRow(pix, W, H - 2)).toContain(TABBY_FEET) // feet one pixel above the roof
  const roof: number[] = []
  for (let x = 0; x < W; x++) roof.push(pix[(H - 1) * W + x])
  expect(roof.every(i => i === CATS_PAL.floorDark || i === CATS_PAL.floorLit)).toBe(true)
})

test('headphones are not sky-colored', async () => {
  const H = 20
  const { pix, W } = catsFrame(H, 'headphones')
  const y0 = H - 1 - SPRITE_H // the cats are not sunk on a band this tall
  const band = catColorsInRow(pix, W, y0 - 1) // the headphone band arcs over the heads
  expect(band.filter(c => c === HEADPHONE_GREY).length).toBeGreaterThanOrEqual(10)
  expect(band.includes(OUTFIT_BLACK)).toBe(false)
})

test('a hit cat leaves the roof', async () => {
  const H = 20
  const { pix, W } = catsFrame(H, 'plain', false, s => {
    s.hits = 0 // even, and hash2(0, 0) < 0.5: cat 0 jumps under either selection rule
    for (let b = 0; b < s.hold.length / 2; b++) s.hold[b] = HIT - 0.4 // its half of the spectrum, pj = 0.5: apex of the jump
  })
  expect(catColorsInRow(pix, W, H - 2, CAT0)).not.toContain(TABBY_FEET) // nothing left standing on the roof
  expect(catColorsInRow(pix, W, H - 5, CAT0)).toContain(TABBY_FEET) // the feet are three pixels up
})

test('a turned cat shows no face', async () => {
  const H = 20
  const y0 = H - 1 - SPRITE_H // where a standing cat's ear tips are
  const eyeRow = y0 + 4 // the sprite's eye row
  const setup = (hold: number) => (s: VisState) => {
    s.hits = 5 // odd, and hash2(0, 5) = 0.83: cat 0 turns under either selection rule
    s.t = 2 // clear of cat 0's blink window (t near a multiple of 4.3), so its eyes would show if not turned
    for (let b = 0; b < s.hold.length / 2; b++) s.hold[b] = hold // its half of the spectrum
  }
  const turned = catsFrame(H, 'plain', false, setup(HIT - 0.7)) // mid turn: back to the camera
  expect(catColorsInRow(turned.pix, turned.W, eyeRow, CAT0)).not.toContain(TABBY_EYE)
  const facing = catsFrame(H, 'plain', false, setup(HIT - 0.02)) // just hit, not yet turned
  expect(catColorsInRow(facing.pix, facing.W, eyeRow, CAT0)).toContain(TABBY_EYE)
})


test('idle cats sit down', async () => {
  const H = 20
  const { pix, W } = catsFrame(H, 'plain', false, s => { s.idle = 20 })
  const y0 = H - 1 - SPRITE_H // where a standing cat's ear tips are
  expect(catColorsInRow(pix, W, y0, CAT0)).not.toContain(TABBY_FEET) // a sitting cat is shorter
  expect(catColorsInRow(pix, W, y0 + 2, CAT0)).toContain(TABBY_FEET) // its ears are two pixels lower
})

test('a mouse crosses the roof', async () => {
  const H = 20
  const { pix, W } = catsFrame(H, 'plain', false, s => { s.mouse = 1.25 }) // halfway across
  const onTheRoof = [...catColorsInRow(pix, W, H - 2), ...catColorsInRow(pix, W, H - 3)]
  expect(onTheRoof).toContain(MOUSE_GREY)
})

test('the moon is drawn round for a tall half-block pixel', async () => {
  const W = 60, H = 16
  const s = createState()
  s.mode = MODES.indexOf('cats')
  s.outfit = OUTFITS.indexOf('plain')
  const pix = new Uint8Array(W * H)
  drawCats(s, pix, W, H, CATS_PAL, CATS_BG_COLORS)
  const counts: number[] = []
  for (let y = 0; y < 8; y++) {
    let count = 0
    for (let x = W - 12; x < W; x++) {
      const idx = pix[y * W + x]
      const color = idx >= CATS_PAL.cats ? CAT_COLORS[idx - CATS_PAL.cats] : undefined
      if (color === MOON_CREAM) count++
    }
    counts.push(count)
  }
  expect(counts).toEqual([5, 7, 9, 9, 9, 7, 5, 0])
})
