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

## Add-ons (phase 4a)

Everything here rides on the same three interfaces: the six peg holes in a
gear's face, a bolt pin with bearings, or the sockets themselves.

- **Crank.** A 2 mm hub ring pegs into the top face of any gear under the
  knob; beyond the knob the arm is a full level thick and carries a press-fit
  socket for a post at the throw (20 to 80 mm). The long post (`POSTH`) with
  the `HANDLE` makes a hand crank; the post with a 10 mm spacer and a link
  makes a crank-rocker. A `CAP` presses into the top of every post. Cranks and
  pointers print upside down (pegs up), which is how the app renders them.
- **Pointer and dial knob.** The pointer is a hub ring with a flat arm. The
  dial knob replaces the knob on that pin: a disc with clock numbers and 60
  ticks under the grip. The pointer runs under the disc and shows past its
  rim, so it reads without parallax and any gear can carry one.
- **Pulleys.** `P20` to `P80` are grooved wheels on the gear hub (bearing,
  peg holes), sized like gears, so `P40` over `P20` is 2:1. Any centre
  distance works with a rubber band or O-ring; cross the band to reverse.
- **Links.** `L2` to `L6` are bars with bearing seats one grid step apart,
  one level thick. A link pivots on a pin like a gear does, or on a crank
  post; the `JOINT` post joins two links to each other (a bearing in each,
  a 3 mm spacer between, a cap on top).
- **Ratchet and pawl.** The ratchet is a 12 tooth sawtooth wheel on the gear
  hub. The pawl clamps on a pin two sockets away along the grid (the knob
  boss and the spacer under it grip it) and a printed leaf spring carries
  the tooth: the wheel turns clockwise past it and locks the other way.
  `PAWL-L` is the mirror image for a wheel that must lock clockwise.
- **N20 motor.** The mount bolts into the sockets at (−1, 2) and (1, 2) from
  the motor socket with two 1-level bolts and knobs, and holds an N20
  gearmotor upside down over the socket with its shaft down into a 20T
  `PINION` (D bore, no bearing) at level 1, 2 or 3. Nothing can sit on the
  two sockets between the legs. Use a 100:1 to 300:1 N20 at 5 or 6 V; a USB
  power bank with a USB-to-DC lead or a 4 x AA box runs it.

## Files

```
scad/gearbox.scad      one entry point for every part (desktop customizer or -D on the CLI)
scad/lib/standard.scad both sizes: every shared dimension
scad/lib/tolerances.scad  print profiles: PLA, PETG, ABS; every clearance in one table
scad/lib/board.scad    tiles, sockets, dovetail edges
scad/lib/gear.scad     gears, compound gears, coupler halves, face patterns
scad/lib/pin.scad      knob, spacers, bushing
scad/lib/coupon.scad   the fit test coupon
scad/lib/addons.scad   crank, posts, handle, cap, pointer, dial knob, pulley, link, ratchet, pawl
scad/lib/motor.scad    N20 motor mount and pinion
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
"1:16 example" is the plan's gate: two 20:80 stages on three pins.

The add-ons are placeable too. An empty level takes a gear, a pulley, a
ratchet wheel, a pawl or a rocker; the top item of a pin can carry a crank
(pick its throw) or a pointer with its dial knob. A pulley takes a band to
any other pulley on its level. A rocker is a link pivoting on its pin, driven
by the crank on another pin through a coupler link; the tester solves the
four-bar every frame and warns when the lengths cannot follow the crank. An
empty socket can take an N20 motor; its pinion becomes the input and its
mount's legs and block are checked against everything around them. "Add-ons
sampler" loads a board with all of them.

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
- Knobs and the dial knob: boss down, 3 walls.
- Cranks and pointers: pegs up (the app renders them that way). Posts, the
  joint and the handle stand up; the cap prints head down.
- Pawls: flat; PETG flexes best, PLA works for the small deflection.
- Motor mount: legs down; the short tongue over the pinion is a 17 mm bridge.
- Everything prints without supports.
