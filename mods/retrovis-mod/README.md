# retrovis-mod

A Claude Code function-hooks mod that draws a classic media-player
visualizer (plasma field + equalizer bars + peak markers) in the band above
the prompt. No daemon, no external process: the animation runs inside the
hooks module at ~30 fps and the "music" is the session itself.

![plasma mode: a color field with equalizer bars and peak markers](demo/plasma.gif)

![cats mode: eight pixel cats in party hats dancing on a rooftop](demo/cats.gif)

| session event | effect |
| --- | --- |
| prompt submitted | big kick, low bands jump |
| tool call | kick on a band chosen by the tool's name |
| turn running | bars pulse on a beat, plasma brightens and speeds up |
| turn done | full-width sweep, then everything fades to a slow idle drift |

The status row under the band reads:

```
▶  Bash            ♪ 3      color: [ classic ]   mode: [ plasma ]
```

The play/pause glyph is whether a turn is running, then the last tool
called (or `prompt` / `idle`), `♪ N` the number of tool calls so far, and
two pickers. Focus the band (click it, or ctrl+x tab), Tab or the arrows
onto a picker and press Enter to cycle it; the focused picker is drawn
inverted by the engine, which is why the name is the button and not an
arrow. Choices are kept across sessions.

**mode** picks the visualization:

- `plasma`: a flowing color field with equalizer bars and peak markers.
  The left picker is then **color**, the bar gradient (classic, fire, ice,
  neon, lime, mono).
- `cats`: a row of pixel cats dancing on a rooftop at night, RealPlayer's
  Annabel the Sheep with cats: a moon, stars that twinkle more as the
  energy rises, a skyline whose windows light up with it, roof tiles that
  pulse on the beat. The groove is dumb and it never stops: the whole row
  bounces on every beat, up a pixel on one beat and down into a squat on
  the next, necks sway past each other in a slow wave, tails swing and
  eyes blink. Each cat owns a slice of the spectrum, so a tool call picks
  one out for most of a second and it does a special move, either a jump
  clear off the roof or a look-away with its tail swapped to the other
  side (a prompt picks the first cat, a finished turn sets all of them
  off). After about half the finished turns a mouse runs the roof from
  right to left, in front of their feet, and every head turns to follow
  it. Leave them alone and they sit down.
  One cat per breed, never repeated: orange tabby, calico, black,
  siamese, grey tabby, tuxedo, white, tortoiseshell; as many as the width
  fits, spread out evenly on a wide band. The left picker is then **outfit**: plain, party hat,
  headphones, sunglasses, bow tie, scarf, crown.

## Height

One `/config` row (plugin `retrovis-mod`): **Band height**, the number of
terminal rows the band takes (2 to 16, default 8). A change reloads the
module. Right after the install the CLI points out that this option has no
value set; ignore that if you like, since the default of 8 rows applies
anyway. To pick a number, pass `--config rows=N` when you install, or visit
`/plugin configure retrovis-mod@xavierforge-mods` whenever.

## Install

```sh
claude plugin marketplace add xavierforge/xavierforge-mods
claude plugin install retrovis-mod@xavierforge-mods --scope local   # this project only
claude plugin install retrovis-mod@xavierforge-mods --scope user    # or every project
```

The env flag that function hooks need, the restart that has to follow, and
what to check when the band never shows up are all in the
[root README](../../README.md).

## Straight from the repo

Cloned the repo instead of installing it? Then skip all of that, set the
flag for just this shell, and hand the engine the mod folder directly, from
the repo root:

```sh
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
claude --plugin-dir ./mods/retrovis-mod
```

The terminal-only caveat still holds.

## Develop

```sh
claude plugin validate ./mods/retrovis-mod   # what the engine sees
claude plugin test ./mods/retrovis-mod       # mounts the band under the engine
cd mods/retrovis-mod && npx -p typescript@5 tsc -p tsconfig.json
```

Both run from the repo root, where `.claude/types` holds the generated
declarations this mod's `tsconfig.json` compiles against. `hooks/vis.ts` is
pure (state, kicks, plasma frame, cell packing), `hooks/cats.ts` holds the
cat sprites, breeds, outfits and stage, and `hooks/register.tsx` is the only
file that touches `$`.
