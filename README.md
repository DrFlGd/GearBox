# GearBox

A modular, 3D printed gear board: interlocking tiles with a grid of bolt
sockets, spur gears riding on ball bearings, and a web app that generates the
parts in your browser. The plan lives in
[Gear Board Generator Plan](https://claude.ai/artifact/VEH5Cni2EtvSYfoMdG2Zfw).

**Part generator: https://drflgd.github.io/GearBox/** – pick a size and a part,
set its options and print profile, and download STL, 3MF or OBJ. Everything
renders in the browser (OpenSCAD compiled to WebAssembly), nothing is uploaded.
Ready-made STLs for every catalog part are on the
[releases page](https://github.com/DrFlGd/GearBox/releases/latest).

## Two sizes

| | **M2** | **M1.5** |
|---|---|---|
| Gear module | 2 mm | 1.5 mm |
| Hole pitch | 20 mm | 15 mm |
| Smallest gear (20T) | 44 mm across | 33 mm across |
| Bolt | M8 hex head (DIN 933) + M8 nut | M6 hex head + M6 nut |
| Bearing | 608 (8 x 22 x 7), one per gear | 606 (6 x 17 x 6), one per gear |
| Gear thickness / level pitch | 8 mm / 10 mm | 7 mm / 9 mm |
| Tile height | 12 mm | 10 mm |
| Bolt length for 1 / 2 / 3 levels | 30 / 40 / 50 mm | 25 / 35 / 40 mm |

Both sizes share everything else: tooth counts 20 to 80 in steps of 10, the
mesh rule (two gears mesh when their tooth counts add up to a multiple of 20,
so 20+20, 20+40, 40+60, 30+50 and so on), the 2 mm gap between stacked gears,
and the same part names. Pick one size for a board; parts do not mix.

## How it goes together

- **Tile.** A flat plate with a plain hole at every grid point and a captive
  hex nut pocket under each hole. It prints top face down, so the top gets the
  bed finish and nothing needs support. Push nuts into the pockets from below.
  Dovetail keys on every edge alternate male and female, so any edge mates
  with any other edge.
- **Pin.** A hex bolt dropped down through the gear stack into the nut,
  tightened by hand with a printed knob. A 2 mm base spacer sits on the plate
  under the first bearing; a 3 mm spacer sits between bearings; the knob's
  boss is the last spacer. Spacers press only the bearing inner races, so
  every gear turns freely.
- **Gear.** One bearing pressed into the hub, six peg holes on each face.
- **Coupler.** Two identical flat rings with three pegs each. Drop one on the
  lower gear pegs down, the other on top flipped and turned 60 degrees: the
  pegs pass through each other's holes into the gears, and the two gears turn
  as one. Compound gears (60T over 20T etc.) are one part and need no coupler.
- **Bushing.** A printed ring that replaces a bearing where a gear only turns
  now and then.

## Files

```
scad/gearbox.scad      one entry point for every part (desktop customizer or -D on the CLI)
scad/lib/standard.scad both sizes: every shared dimension
scad/lib/tolerances.scad  print profiles: PLA, PETG, ABS; every clearance in one table
scad/lib/board.scad    tiles, sockets, dovetail edges
scad/lib/gear.scad     gears, compound gears, coupler halves, face patterns
scad/lib/pin.scad      knob, spacers, bushing
scad/lib/coupon.scad   the fit test coupon
catalog/parts.json     every stock part with its parameters and expected size in each size
tools/render.mjs       render one part with OpenSCAD (WASM, Manifold backend)
tools/render-catalog.mjs  render and check the whole catalog for one or both sizes
tools/preview.mjs      screenshot STLs with three.js in headless Chromium
lib/BOSL2              git submodule, the gear library
app/                   the web part generator (Vite + React + three.js, OpenSCAD in a Web Worker)
.github/workflows      render check on every PR, Pages deploy on main, release on demand
```

## Rendering

No OpenSCAD install needed: the tools run the same WebAssembly build the web
app uses (OpenSCAD 2025.01, Manifold backend).

```sh
git clone --recurse-submodules https://github.com/DrFlGd/GearBox
npm install
npm run render -- --profile PETG              # every part, both sizes, to out/<size>/PETG/*.stl
npm run render -- --size M1.5 --only COUPON,CPL,K,S3,BS   # just the M1.5 fit test kit
npm run part -- -o out/G40.stl -D 'size="M1.5"' -D 'part="gear"' -D teeth=40 -D 'face="spokes"'
```

In desktop OpenSCAD, open `scad/gearbox.scad` and use the customizer. BOSL2
must be on your library path: either install it in your OpenSCAD libraries
folder or set `OPENSCADPATH` to this repo's `lib` folder.

### The web app

```sh
npm run dev       # http://localhost:5173/GearBox/
npm run build     # static site in dist/, deployed to GitHub Pages by .github/workflows/pages.yml
```

The app embeds `scad/` and the parts of BOSL2 it needs at build time, so a
change to the library shows up in the app on the next build. The engine
(`openscad-wasm-prebuilt`, 11 MB) is served as one file from `engine/` and
loaded by the render worker. A part's options live in the URL hash, so a link
like `https://drflgd.github.io/GearBox/#size=M1.5&part=gear&teeth=60` opens
that part. The fit overrides in the profile panel are the keys of
`scad/lib/tolerances.scad` and are passed to OpenSCAD as `overrides=[...]`.

### The layout tester

The **Layout** tab in the app is a virtual board. Click a socket to add a pin
and a gear, stack more gears on a pin by level, and mark one gear as the
input. The tester colours every gear: green is the input, yellow turns, grey
touches nothing, red collides with a gear, a spacer or a knob on another pin.
Hover a gear for its speed and direction relative to the input. Two gears on
the same level mesh when their tooth counts add up to a multiple of 20 and
their pins are that many twentieths of the grid apart (20T+20T two sockets,
20T+80T five sockets, or a 3-4-5 diagonal). Joining a stacked gear to the one
below carries motion between levels: a bigger gear under a smaller one is
one compound part, any other pair takes two coupler halves. The bill of
materials counts tiles, gears, knobs, spacers, bolts by length, nuts and
bearings; "Download kit zip" renders every distinct part for your size and
profile. The whole layout lives in the link, so it can be bookmarked or sent.
"Load 1:16 example" is the plan's gate: two 20:80 stages on three pins.

## First print: the fit test coupon

Print the fit test kit for your size (`COUPON`, two `CPL`, `K`, `S3`, `BS`) in
your material with the matching profile, and have one bolt, one nut and one
bearing to hand. Check, in order:

1. The bearing presses into the seat by hand and stays.
2. A nut pushes into either pocket from below and does not turn.
3. The bolt drops through a hole, the spacers slide over it, and the knob's hex pocket grips its head.
4. One coupler half's pegs drop into the holes around the bearing seat with a little play; the two halves nest into each other.
5. The male dovetail of a second coupon (or a tile) slides into the female slot without force and without slop.

If a fit is off, change that one value in `scad/lib/tolerances.scad` (or use
the fit overrides in the web app) and print the coupon again.

## Print settings

- Tiles: top face down, 0.2 mm layers, 3 walls, 20 percent infill. The web app
  and the catalog render them print-ready (flipped).
- Gears, spacers, bushings, coupler halves: flat side down, 3 walls. Couplers
  print pegs up.
- Knobs: boss down, 3 walls.
- Everything prints without supports.
