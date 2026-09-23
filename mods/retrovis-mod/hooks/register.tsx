/* @jsx h */
// retrovis-mod: a classic media-player visualizer above the prompt. The
// animation runs in this module on a 33 ms clock; session events kick it.
// No variable here is named `h`.
import type { Register } from 'claude-code'
import { MODES, OUTFITS, THEMES, createState, cycleLeft, cycleMode, kick, leftPicker, renderFrame, step } from './vis.ts'

const MIN_COLS = 20
const MAX_COLS = 512
const FRAME_MS = 33

type Size = { cols: number; rows: number }

export const register: Register = (on, options) => {
  const bandRows = Math.max(2, Math.min(16, Math.round(Number(options.rows) || 8)))

  const vis = createState()
  let bandId: string | undefined
  let size: Size = { cols: 80, rows: bandRows }
  let lastTick = Date.now()
  let inflight = false

  // fixed-width columns so the pickers never move when the text changes
  const TRACK_W = 14
  const LEFT_W = Math.max(...THEMES.map(t => t.name.length), ...OUTFITS.map(o => o.length))
  const MODE_W = Math.max(...MODES.map(m => m.length))
  const status = () => (vis.working ? '▶ ' : '❚❚') + ` ${vis.track.slice(0, TRACK_W).padEnd(TRACK_W)}  ♪ ${String(vis.hits).padEnd(4)}`
  const centered = (n: string, w: number) => {
    const pad = w - n.length
    return ' '.repeat(Math.floor(pad / 2)) + n + ' '.repeat(Math.ceil(pad / 2))
  }
  const leftLabel = () => { const p = leftPicker(vis); return centered(p.values[p.index], LEFT_W) }
  const modeLabel = () => centered(MODES[vis.mode], MODE_W)

  on('session.start', async ($, e, next) => {
    const [theme, outfit, mode] = await Promise.all([$.store.get('theme'), $.store.get('outfit'), $.store.get('mode')])
    const t = THEMES.findIndex(x => x.name === theme); if (t >= 0) vis.theme = t
    const o = OUTFITS.indexOf(outfit as (typeof OUTFITS)[number]); if (o >= 0) vis.outfit = o
    const m = MODES.indexOf(mode as (typeof MODES)[number]); if (m >= 0) vis.mode = m
    $.clock.every(FRAME_MS, async () => {
      const now = Date.now()
      const dt = Math.min(0.25, (now - lastTick) / 1000)
      lastTick = now
      step(vis, dt)
      if (!bandId || inflight) return
      inflight = true
      try {
        const r = await $.ui.blit({ requestId: bandId, key: 'vis', cells: renderFrame(vis, size.cols, size.rows), columns: size.cols, rows: size.rows })
        if (r.deny && !/mount|size/i.test(r.deny)) $.ui.log(`retrovis-mod: blit denied: ${r.deny}`)
      } catch {
        // the site is being redrawn; the next tick will find the new mount
      } finally {
        inflight = false
      }
    })
    return next(e)
  })

  // session events are the "music"
  on('prompt.submit', async ($, e, next) => {
    kick(vis, 'prompt')
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('turn.start', async ($, e, next) => {
    kick(vis, 'turn')
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    kick(vis, 'tool', e.tool)
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    kick(vis, 'done')
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      bandId = undefined
      return next(e)
    }
    vis.working = e.props.isWorking
    const cols = Math.max(MIN_COLS, Math.min(MAX_COLS, e.props.bodyColumns))
    const rows = Math.max(2, Math.min(bandRows, e.props.maxRows - 3))
    size = { cols, rows }
    bandId = e.requestId
    const { Box, Raster, Text, Button } = $.ui.resolve(e)
    // two pickers, each one Button (Enter cycles forward); the choices are kept across sessions.
    // The focus ring inverts whatever it rests on, so the name is the element: an inverted
    // name reads as "selected", where an inverted arrow read as a glitch.
    const save = () => {
      $.store.set('theme', THEMES[vis.theme].name).catch(() => {})
      $.store.set('outfit', OUTFITS[vis.outfit]).catch(() => {})
      $.store.set('mode', MODES[vis.mode]).catch(() => {})
      $.ui.invalidate('ui.render')
    }
    const left = leftPicker(vis)
    return (
      <Box flexDirection="column">
        <Raster key="vis" columns={cols} rows={rows} cells={renderFrame(vis, cols, rows)} />
        <Box flexDirection="row">
          <Text dimColor={!vis.working} color={vis.working ? 'cyan' : undefined}>{status()}</Text>
          <Text dimColor>{`   ${left.label}: `}</Text>
          <Button key="left" label={leftLabel()} onPress={() => { cycleLeft(vis, 1); save() }} />
          <Text dimColor>{'   mode: '}</Text>
          <Button key="mode" label={modeLabel()} onPress={() => { cycleMode(vis, 1); save() }} />
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
