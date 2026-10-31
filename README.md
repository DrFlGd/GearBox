# GearBox

A modular, 3D printed gear board: interlocking tiles with a grid of bolt
sockets, spur gears riding on ball bearings, and a web app that generates the
parts in your browser. The plan lives in
[Gear Board Generator Plan](https://claude.ai/artifact/VEH5Cni2EtvSYfoMdG2Zfw).

**Web app: https://drflgd.github.io/GearBox/** – **Kits** shows each kit
assembled, exploded or laid out for printing, with its parts and hardware,
and downloads the whole kit; **Parts** makes one part with your own options
as STL, 3MF or OBJ; **Layout** is a virtual board for your own gear train.
Print profile, gear joints, fit tuning and the legacy and test parts are under
**Settings**. Everything renders in the browser (OpenSCAD compiled to
WebAssembly), nothing is uploaded.
Ready-made STLs for every catalog part are on the
[releases page](https://github.com/DrFlGd/GearBox/releases/latest).

## Three sizes

| | **M2** | **M1.5** | **M1** |
|---|---|---|---|
| Gear module | 2 mm | 1.5 mm | 1 mm |
| Hole pitch | 20 mm | 15 mm | 10 mm |
| Smallest gear (20T) | 44 mm across | 33 mm across | 22 mm across |
| Bolt | M8 hex head (DIN 933) + M8 nut | M6 hex head + M6 nut | M5 hex head + M5 nut |
| Bearing | 608 (8 x 22 x 7), one per gear | 606 (6 x 17 x 6), one per gear | 605 (5 x 14 x 5), one per gear |
| Gear thickness / level pitch | 8 mm / 10 mm | 7 mm / 9 mm | 6 mm / 8 mm |
| Tile height | 12 mm | 10 mm | 8.5 mm |
| Bolt length for 1 / 2 / 3 levels | 30 / 40 / 50 mm | 25 / 35 / 40 mm | 20 / 30 / 40 mm |

M1 is the desk-toy size. Its 20T gears are too small for any joint, jaws
or dowel pins (the 605 bearing fills the hub), so in M1 a 20T can only be
the small half of a compound gear and cannot carry a crank or a pointer;
30T and up work as in the other sizes. On the 10 mm grid the M5 nut pockets alternate
30 degrees so neighbouring pockets keep a wall between them.
The ratchet and pawl, the escapement, the NEMA 17 mount, the stock
quick-return levers, `SG40` and `MG12` do not fit the 10 mm grid and are not
made in M1; the generator, the kits and the layout tester say so.

All sizes share everything else: tooth counts 20 to 80 in steps of 10, the
mesh rule (two gears mesh when their tooth counts add up to a multiple of 20,
so 20+20, 20+40, 40+60, 30+50 and so on), the 2 mm gap between stacked gears,
and the same part names. Pick one size for a board; parts do not mix.

## How it goes together

- **Tile.** A flat plate with a plain hole at every grid point and a captive
  hex nut pocket under each hole. It prints top face down, so the top gets the
  bed finish and nothing needs support. Push nuts into the pockets from below.
  Dovetail keys on every edge are laid out so that each edge is its own
  mirror image with male and female swapped: any edge mates with any other
  edge of the same length, either way round. (Tiles from before v0.8.0 with
  an even number of keys per edge, such as `B4x4`, did not mate; reprint
  them.)
- **Pin.** A hex bolt dropped down through the gear stack into the nut,
  tightened by hand with a printed knob. A 2 mm base spacer sits on the plate
  under the first bearing; a 3 mm spacer sits between bearings; the knob's
  boss is the last spacer. Spacers press only the bearing inner races, so
  every gear turns freely.
- **Gear.** One bearing pressed into the hub, three jaws on the top face and
  three matching pockets in the bottom face (with the default joint, below).
- **Joining two gears.** Three tapered crescent jaws stand on every gear's
  top face, and the gear above drops its pockets over them across the 2 mm
  gap between levels, so the two turn as one with no hardware. The jaws'
  end flanks lean in 20 degrees, so the upper gear settles onto the wedge
  with about 0.1 mm to spare each side instead of the full slot clearance:
  about ±0.4 degrees of play in M2, where the straight jaws of the first
  test rocked about ±3. The jaws sit on one band per size, so any gear
  stacks on any other: in M2 between the bearing seat and a 20T's root, in
  M1.5 as a thinner jaw on the old pin-hole circle (a 20T keeps its joint),
  in M1 on a 30T's band (an M1 20T has no joint). For a gear that turns
  free above another, either print the lower gear with a flat top (`-FT`,
  `joint_top = "flat"`; the layout tester's kit export does this) or the
  free gear with a groove underneath that the jaws turn in (`G40F` and so
  on, `joint_bottom = "groove"`). A part too small for the band (the
  ratchet, the cams, `WG20`, and in M1 `GENEVA6`, the winch and the
  flywheel) takes the dowel pin holes instead and joins with pins whichever
  joint is picked. Compound gears (60T over 20T etc.) are one part and need
  no joint.
- **Other joints.** The app's **Settings** have a **Gear joints** switch that
  sets the joint of every part, kit download and layout export:
  - *Jaws* (default): as above.
  - *Dowel pins*: the legacy joint. Six dowel pin holes in each face; three
    steel pins sit in the lower gear's top face and the upper gear drops
    onto them (the printed `CPL` coupler fits the same holes).
  - *Pins + screws*: the dowel pins, plus three socket head screws clamping
    the pair on 30T and bigger gears (40T and up in M1): M3 for M2, M2.5 for
    M1.5, M2 for M1. Every other screw hole has a counterbore for the head
    on top and a hex pocket for the nut underneath, so turn the upper gear
    60 degrees and each screw goes down through a counterbore into the nut
    pocket of the gear below. The printed `JRING` joint ring fills the 2 mm
    gap so the screws clamp on plastic, not on the bearings.
- **Bushing.** A printed ring that replaces a bearing where a gear only turns
  now and then.

### Hardware for the interface

| | **M2** | **M1.5** | **M1** |
|---|---|---|---|
| Jaws (default joint) | none | none | none |
| Joint dowel pins (3 per joined pair; pins and pins + screws) | 3 x 8 mm | 2 x 6 mm | 2 x 6 mm |
| Hub dowel pins (3 per crank or pointer; pins and pins + screws) | 3 x 6 mm | 2 x 4 mm | 2 x 4 mm |
| Joint screws (3 per pair; pins + screws) | M3 x 14 + nut, 30T and up | M2.5 x 12 + nut, 30T and up | M2 x 10 + nut, 40T and up |
| Crank post bolt, handle / link or slot | M8 x 45 / M8 x 25 + nut | M6 x 40 / M6 x 20 + nut | M5 x 35 / M5 x 20 + nut |
| Shaft bracket shaft | M8 x 100 | M6 x 80 | M5 x 60 |
| Magnets | 6 x 3 mm neodymium discs | 4 x 2 mm | 3 x 2 mm |
| Hex sleeve bearings (2 per sleeve) | 688 (8 x 16 x 5) | 686 (6 x 13 x 5) | 685 (5 x 11 x 5) |

Hardened steel dowel pins (ISO 8734 / DIN 6325) are cheap in assortment
boxes. The pin holes are a slip fit in gear faces and a press fit where a
pin stays put (hub rings, post tops); both are in the print profile, as are
the jaws' flank clearance (`jaw_flank`) and radial clearance (`slot_clear`).
The `JOINT` post's cap and the planetary carrier's caps keep their dowel pin
with every joint.

## Add-ons (phase 4a)

Everything here rides on the same three interfaces: the joint on a gear's
face (jaws, or pin holes with the other joints), a bolt pin with bearings, or
the sockets themselves.

- **Crank.** A thin hub ring sits on the top face of any gear under the knob,
  keyed by three tapered sockets that drop over the gear's jaws (with the
  pin joints, by three short dowel pins pressed into the ring); a collar
  round the jaws stiffens it, and beyond the knob the arm is a full level
  thick. The crank post is a bolt from the kit: its head
  sits in a hex pocket under the arm at the throw (20 to 80 mm) and the shank
  stands up. With the `SH` handle spacer, the `HANDLE` grip over it and a nut
  on top (`M8 x 45`) it is a hand crank; with a bearing and a link or a slot
  over it (`M8 x 25`) it drives a rocker, a lever or a carriage. Cranks and
  pointers print upside down (hub ring up), which is how the app renders
  them.
- **Pointer and dial knob.** The pointer is a hub ring with a flat arm,
  keyed on the jaws like the crank. The dial knob replaces the knob on that
  pin: a disc with clock numbers and 60 ticks under the grip, standing high
  enough to clear the jaw tops, so its bolt is the dial bolt length the
  layout tester's bill lists (5 mm longer in some M1.5 and M1 stacks). The
  pointer runs under the disc and shows past its rim, so it reads without
  parallax and any gear can carry one.
- **Pulleys.** `P20` to `P80` are grooved wheels on the gear hub (bearing,
  jaws), sized like gears, so `P40` over `P20` is 2:1. Any centre
  distance works with a rubber band or O-ring; cross the band to reverse.
- **Links.** `L2` to `L6` are bars with bearing seats one grid step apart,
  one level thick. A link pivots on a pin like a gear does, or on a crank
  post; the `JOINT` post joins two links to each other (a bearing in each,
  a 3 mm spacer between, a `CAP` on top keyed by a dowel pin pressed into
  the post).
- **Ratchet and pawl.** The ratchet is a 12 tooth sawtooth wheel on the gear
  hub; it is too small for the jaws, so it joins a gear above or below with
  dowel pins whichever joint is picked. The pawl clamps on a pin two
  sockets away along the grid (the knob boss and the spacer under it grip
  it) and a printed leaf spring carries the tooth: the wheel turns clockwise past it and locks the other way.
  `PAWL-L` is the mirror image for a wheel that must lock clockwise.
- **N20 motor.** The mount bolts into the sockets at (−1, 2) and (1, 2) from
  the motor socket with two 1-level bolts and knobs, and holds an N20
  gearmotor upside down over the socket with its shaft down into a 20T
  `PINION` (D bore, no bearing) at level 1, 2 or 3. Nothing can sit on the
  two sockets between the legs. Use a 100:1 to 300:1 N20 at 5 or 6 V; a USB
  power bank with a USB-to-DC lead or a 4 x AA box runs it.

## Mechanisms (phase 4b)

The same three interfaces again, plus one new one: a **slider rail** that
bolts to the board and carries a sliding carriage.

- **Slider rail and carriages.** `RAIL2` to `RAIL8` run along a row of
  sockets with a dovetail ridge; tabs at both ends bolt into the sockets of
  the row beside it (its left, looking along it) with 1-level bolts and
  knobs. `CARRIAGE` slides on the ridge and has a square pocket on top for
  the scotch yoke tower or the slider post. Rails print flat, carriages
  upside down.
- **Rack.** `RACK2` to `RACK4` are carriages with a toothed bar along one
  side (teeth at level 1 or 2). The pitch line sits one grid step from the
  rail, so a 20T pinion goes two rows from the rail and a 40T three.
- **Scotch yoke.** `YOKE<throw>R<reach>` plugs into the carriage: a tower
  and a beam carry a slotted plate two levels above the crank's gear; the
  crank post's bearing rides in the slot. The crank sits on the rail's own
  row past its end. The carriage moves with a pure sine motion of twice the
  throw.
- **Crank slider.** `SLPOST` plugs into the carriage and puts a post at the
  crank's link level; a link from the crank post to it is the classic
  piston drive.
- **Cams.** `CAM-E` (eccentric, sine lift), `CAM-H` (heart, even rise and
  fall) and `CAM-S` (snail, slow rise and a drop) are discs on the gear hub
  lifting half a grid step (joined with dowel pins: a cam is too small for
  the jaws). `FOLLOWER` is an arm on a pin two sockets away
  with a round nose on the cam and a tail for a rubber band that holds it
  down.
- **Geneva drive.** `GENEVA6-D` and `GENEVA8-D` are 40T gears with a drive
  post and a locking crescent one level up (two bearings); `GENEVA6` and
  `GENEVA8` are the slotted wheels, on a pin three sockets away one level
  above the driver. One turn of the driver indexes the wheel one slot and
  locks it in between.
- **Partial gears.** `G<n>H` and `G<n>Q` have teeth on half or a quarter of
  the rim: whatever they mesh with turns in bursts and rests between.
- **Quick-return lever.** `QR<d>-<throw>` is a slotted lever pivoting `d`
  sockets from a crank, two levels above the crank's gear; the crank post's
  bearing rides in the slot, so the lever swings slowly one way and quickly
  back. A post socket at its end takes a link.
- **Escapement.** `ESCWHEEL` is a 15 tooth wheel; `ANCHOR` is a recoil
  anchor on a pin two sockets away with a balance bar that sets the beat
  (clamped by its nut). The wheel steps one tooth per swing. `ANCHOR-L` is
  the mirror image for a wheel that runs counter-clockwise.
- **Wind-up spring.** `SG30` to `SG80` are gears with a wall on the top
  face (and no jaws there); `SPRING` is a printed spiral (PETG works best) whose boss grips the
  bearing's inner race and whose hook catches the wall. Hold the pin with
  its knob, wind the gear, let the train run down.
- **Winch.** `WINCH` is a two-level drum with a bottom flange on two
  bearings, `WFLANGE` presses on top, `HOOK` goes on the string.

## Drives (phase 4c)

- **Planetary set.** `CARRIER` is a 60T gear with four posts on its top face;
  two standard `G20` planets ride the posts on bearings, each kept on by a
  `CAP` keyed by a dowel pin. A plain `G20` sun sits on the same pin one level up, inside the
  `RING-L2` (or `RING-L3`) 60T ring gear whose legs bolt into the sockets
  four steps away on either side with socket or button head screws sunk in
  the leg tops (no knobs, so a gear on top of the sun can be bigger than the
  ring and pass over the legs; the recess takes heads at least 10 mm across). Sun in, carrier out: 4:1, same
  direction. Drive the sun through a gear joined on top of it (on its jaws);
  the carrier meshes like any 60T (a 20T four sockets away, a 40T on a
  3-4-5 diagonal).
- **Shaft bracket.** `BRACKET` is a bar along a socket row with a bearing
  housing at each end; the bar's bolt heads sit flush in hex pockets
  (tighten with a socket, the nuts are in the board). A 4-level bolt through
  the housings' bearings is a horizontal shaft at the middle of level 4.
- **Bevel pair.** `BEVEL` (`BEVEL40`) is a 20T (40T) spur gear with a tall hub and a 20T bevel
  on top, on a pin two sockets before the first housing; it fills its pin.
  `BEVEL-S` is the mate on the shaft, with a hub back to the housing and a
  nut pocket that keys and clamps it. The spur below is driven like any 20T.
- **Worm.** `WORM` fills the gap between the housings, keyed to the shaft by
  a nut in its hub, and turns `WG20` (two rows from the shaft) or `WG40`
  (three rows) on level 4, one tooth per turn: 20:1 or 40:1, self-locking.
  Print it standing, slowly, with cooling.
- **NEMA 17.** `NEMA17` bolts into the sockets at (−2, 0) and (2, 0) from the
  motor socket and carries a plate the stepper screws onto from below (four
  M3 x 8), shaft down into `PINION5` (5 mm D bore) at level 1, 2 or 3. Any
  stepper driver works; a 12 V supply and an A4988 or TMC2209 is the usual
  pair.
- **Flywheel.** `FLYWHEEL` is a disc on the gear hub with eight nut pockets
  around the rim: drop in nuts for the mass. It smooths a crank's or an
  escapement's drive.

## Files

```
scad/gearbox.scad      one entry point for every part (desktop customizer or -D on the CLI)
scad/fit-check.scad    interference checks for the face joint (jaws, grooves, cranks, knobs)
scad/lib/standard.scad all three sizes: every shared dimension
scad/lib/tolerances.scad  print profiles: PLA, PETG, ABS; every clearance in one table
scad/lib/board.scad    tiles, sockets, dovetail edges
scad/lib/gear.scad     gears, compound gears, dowel pin and screw joints, magnet pockets, face patterns
scad/lib/jaws.scad     the face joint: tapered jaws, pockets and grooves, the joint switch, the straight jaw test gears
scad/lib/pin.scad      knob, spacers, bushing
scad/lib/coupon.scad   the fit test coupon
scad/lib/addons.scad   crank, posts, handle, cap, pointer, dial knob, pulley, link, ratchet, pawl
scad/lib/motor.scad    N20 motor mount and pinion
scad/lib/mechanisms.scad  rail, carriages, rack, yoke, cams, Geneva, partial gears, quick return, escapement, spring, winch
scad/lib/drives.scad   planetary ring and carrier, shaft bracket, bevel pair, worm and worm gear, NEMA 17 mount, flywheel
scad/lib/magnets.scad  magnetic gears and the face coupling's barrier
scad/lib/assembly.scad every kit put together, with its hardware, for the Assembly part
catalog/parts.json     every stock part with its parameters and expected size in each size
tools/render.mjs       render one part with OpenSCAD (WASM, Manifold backend)
tools/render-catalog.mjs  render and check the whole catalog for one size or all, one part per core
tools/preview.mjs      screenshot STLs with three.js in headless Chromium
lib/BOSL2              git submodule, the gear library
app/                   the web part generator (Vite + React + three.js, OpenSCAD in a Web Worker)
.github/workflows      build on every PR (plus the full catalog render when a part source changed), Pages deploy on main, release on demand (zips re-rendered only when parts changed)
```

## Rendering

No OpenSCAD install needed: the tools run the same WebAssembly build the web
app uses (OpenSCAD 2025.01, Manifold backend).

```sh
git clone --recurse-submodules https://github.com/DrFlGd/GearBox
npm install
npm run render -- --profile PETG              # every part, every size, to out/<size>/PETG/*.stl
npm run render -- --size M1.5 --only COUPON,K,S3,BS   # just the M1.5 fit test kit
npm run render -- --size M2 --joint pins      # the dowel pin parts, to out/M2/PETG-pins/ (or --joint bolts)
npm run part -- -o out/G40.stl -D 'size="M1.5"' -D 'part="gear"' -D teeth=40 -D 'face="spokes"'
```

In desktop OpenSCAD, open `scad/gearbox.scad` and use the customizer. BOSL2
must be on your library path: either install it in your OpenSCAD libraries
folder or set `OPENSCADPATH` to this repo's `lib` folder.

`scad/gearbox.scad` includes every file in `scad/lib/` exactly once, and the
library files do not include each other: OpenSCAD's `include` is textual, so
nested includes parsed BOSL2 again for every file that pulled in `gear.scad`
and made each part take about five times longer. A new library file goes in
the include list in `gearbox.scad`.

### The web app

```sh
npm run dev       # http://localhost:5173/GearBox/
npm run build     # static site in dist/, deployed to GitHub Pages by .github/workflows/pages.yml
```

The app embeds `scad/` and the parts of BOSL2 it needs at build time, so a
change to the library shows up in the app on the next build. The engine
(`openscad-wasm-prebuilt`, 11 MB) is served as one file from `engine/` and
loaded by the render worker.

The app opens on the **Kits** tab. Pick a kit on the left (grouped into basics,
motors, mechanisms, drives and magnets); the tabs over the view switch between
the assembled kit, the exploded kit and the print layout (every printed part
flat on 220 mm beds). Click a part in the kit's list to see it alone, download
it, or open it in **Parts** to change it. The download box takes the whole kit
as a print layout 3MF (one object per part), a print layout STL, or a zip of
STLs with a README of the hardware. **Parts** has a search box, folding groups
and the catalog presets as chips over each part's options; the one download
group in the toolbar takes the part as STL, 3MF or OBJ. **Settings** (top
right) hold the print profile, the gear joint, the fit overrides with a link
to the fit test kit, the legacy and test parts (fit test coupon, printed
coupler, the old crank post, the hex sleeve and straight jaw experiments),
whether a part re-renders as you change it, the OpenSCAD console, and a button
to clear the saved renders. The selection lives in the URL hash, so a link
like `https://drflgd.github.io/GearBox/#size=M1.5&part=gear&teeth=60` opens
that part and `#mode=kits&kit=geneva&view=exploded` that kit (older
`#part=assembly&kit=...` links still work). Rendered models are kept in the browser (IndexedDB, newest 400),
keyed by the part's settings, profile, fit overrides and a hash of the
library and engine, so opening a part, kit zip or print plate again loads
at once; any change to those renders fresh. The fit overrides in Settings are the keys of
`scad/lib/tolerances.scad` and are passed to OpenSCAD as `overrides=[...]`.

The 3D views share one look (`app/src/components/look.ts`): curved surfaces
shade smooth while edges sharper than 35 degrees stay crisp, a soft room
environment and a shadow-casting key light give depth, and a contact shadow
sits under the model. It is display only, so it changes no render, download
or cached model.

The Layout tab shows the real printed parts. The bill of materials records
which part (and which faces: jaws, flat top, pin holes) each thing on the
board is, and `app/src/layout/realParts.ts` renders each distinct part once
through the same worker and browser cache as the Kits view and the downloads.
Until a part is ready the board draws a quick stand-in (involute gears,
boxes, cylinders), so a new board fills in over a few seconds per distinct
part and opens at once after that. Real so far: tiles, knobs and dial knobs,
gears and compounds, pulleys, partial, spring, magnetic and worm gears, bevels,
flywheels, ratchet and pawl, cams and follower, Geneva driver and wheel,
escape wheel and anchor, quick-return lever, winch drum, planet carrier, the
crank, handle and pointer on a gear, motor mounts with their pinions and leg
knobs, rails with their tab knobs, the rack, carriage, scotch yoke, slider post
and link, the shaft bracket with its bevel and worm, the planetary ring, and
the four-bar links with their joint post. Caps and the spring spiral are still
stand-ins.

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
one compound part, any other pair joins with the **Gear joints** setting in
Settings (jaws by default; dowel pins; or pins and screws when both are 30T
or more, 40T in M1); two plain 40T or bigger gears can be joined by magnets
instead. With jaws the kit export sets each face to what its stack needs:
a part gets jaws on top only where something is joined onto it or a crank
or pointer keys onto it, and a flat top otherwise (`-FT`), so a free gear
or the knob can sit right above it; a joined pair too small for the jaws
gets dowel pin holes instead (`-PT`, `-PB`). The bill
of materials counts tiles, gears, knobs, spacers, bolts by length, nuts,
bearings, dowel pins, screws and magnets (click a printed part to open it in
Parts); the download box under it renders every distinct part for your size,
profile and joint, as a print layout 3MF or STL or as a zip of STLs. The whole layout lives in the link, so it can be bookmarked or sent.
The **Start from** menu loads the examples; "1:16 example" is the plan's gate: two 20:80 stages on three pins.

The add-ons are placeable too. An empty level takes a gear, a pulley, a
ratchet wheel, a pawl or a rocker; the top item of a pin can carry a crank
(pick its throw) or a pointer with its dial knob. A pulley takes a band to
any other pulley on its level. A rocker is a link pivoting on its pin, driven
by the crank on another pin through a coupler link; the tester solves the
four-bar every frame and warns when the lengths cannot follow the crank. An
empty socket can take an N20 motor; its pinion becomes the input and its
mount's legs and block are checked against everything around them. "Add-ons
sampler" loads a board with all of them.

The mechanisms are placeable too: cams with their followers, Geneva drivers
and wheels, partial gears, quick-return levers, escape wheels with their
anchors, winches and the spring on a gear's top face. An empty socket can
start a slider rail; pick its direction and length, then a rack, a scotch
yoke or a crank slider for it. The tester finds the rack's pinion and the
yoke's or slider's crank, works out the carriage travel, warns when it runs
off the rail or the arm hits a knob, and animates the real motions: the
Geneva wheel indexes and dwells, the escape wheel steps, the follower rides
its cam, the partial gear drives in bursts (a partial gear turned by a full
one stops once its bare side comes round, and the tester says so). "Mechanisms
sampler" loads a board with most of them. A rack only travels so far, so on a
board with a rack the view swings the input back and forth instead of turning
it; "Rack and pinion" loads one.

The drives too: a planet carrier takes its sun on the level above and its
ring gear's legs are checked against the pins around it; a shaft bracket is a
fixture like the rail, finding its bevel gear and its worm gear and turning
them at the right ratio; NEMA 17 motors sit on a socket with their own leg
pattern; flywheels are plain discs. "Drives sampler" chains a NEMA 17, a
planetary set, a bevel pair, a worm and a flywheel.

Magnetic gears mesh with each other at the same distances as the toothed
gears they stand for and collide with toothed ones; "Magnets sampler" has a
pair of them and a magnetic face coupling.

## Magnets (phase 5a)

Disc magnets drive without contact. Press each one into its pocket with the
poles as the dots show (the dotted pockets take north up, or north outward);
a drop of CA glue keeps them in.

- **Magnetic gears.** `MG12`, `MG16`, `MG20` and `MG24` are discs with that
  many magnets standing on edge in the rim, poles alternating. Two of them
  turn each other across a 1 mm air gap like spur gears of 2.5 times their
  magnet count (`MG16` behaves as a 40T), so the usual spacing rule applies:
  two `MG16` sit four sockets apart. They slip instead of stalling, which
  makes them a torque limiter, and they run through a thin sheet of plastic
  or acrylic.
- **Magnetic face coupling.** `G40-MT` has six magnets in its top face,
  `G40-MB` six in its bottom face. Stack them on one pin with `MAGB`, the
  barrier, between their bearings: the barrier is a spacer with a thin flange
  that fills the gap and stands still. Turn the lower gear and the upper one
  follows through the wall. Any gear of 40T or more can carry the magnets
  (`magnets = "top"` or `"bottom"` in the generator).

## Hex sleeve (experiment)

A quicker way to stack gears and levers that turn together: no pins, no
screws. `HXS2` and `HXS4` are hex tubes for two or four levels that turn on
the pin's bolt on two small bearings pressed into their ends (688 for M2,
686 for M1.5, 685 for M1). A printed core tube (`HXC2`, `HXC4`, same
levels as the sleeve) sits between the two bearings' inner races, so the
knob clamps the races and the sleeve stays free. The pin is otherwise the
usual one: base spacer under the sleeve, knob on top, a bolt for the
sleeve's levels.

Hex-bore parts slide down onto the sleeve, rest on its bottom flange and
turn with it:

- `HG20`, `HG30`, `HG40`, `HG60`: hex-bore gears, 1 mm thinner than
  standard gears with their tops level with them, so they mesh with
  standard gears on the next pin. (No `HG20` in M1: its root circle is too
  close to the hex.)
- `HSP0` fills the 3 mm gap to the next level; `HSP1` skips a level as well.
- `HL4` is a lever with seats for standard bearings two and three grid
  steps out, to drive a link or a slot from a stack.

The `hexsleeve` kit builds one 4-level stack (`HG40`, `HSP0`, `HG30`,
`HSP1`, `HL4`) next to a standard pin with free `G20` and `G30` gears, so
the lever turns both of them at different speeds. The lever sits on level
4, above the second pin's knob. Print the sleeve standing; the hex fit
uses the profile's slot clearance, so print the coupon first and adjust
that value if parts are tight on the sleeve.

## Straight jaw gears (M2 test)

The first jaw test, kept for comparison with the tapered jaws every gear now
has. `JG20`, `JG30` and `JG40` have three crescent jaws with straight flanks
standing 4.5 mm on the top face and three matching pockets 3 mm deep in the
bottom face, on the hub between the bearing seat and the 20T's root circle.
The upper gear's pockets drop over the lower gear's jaws across the 2 mm gap
and take 2.5 mm of them, with the profile's slot clearance all round, which
lets a stacked pair rock about ±3 degrees. The tapered jaws seat on their
20 degree flanks instead (about ±0.4 degrees in M2). The `jaws` kit stacks
all three on one 3-level pin; a `G40` and a `G30` stacked on one pin are the
tapered pair to try against `JG40` and `JG30`. M2 only.

## Assemblies

The **Assembly** part in the generator shows a whole kit put together on its
tiles, with the purchased hardware (bolts, nuts, bearings, dowel pins,
screws, magnets) in steel grey, assembled or exploded. Its panel lists the
kit's printed parts and hardware. Every kit in the catalog has one. Its download lays the kit's printed parts out for printing: each part flat in its print orientation, spaced apart on 220 mm plates, as a 3MF with one object per part (or one STL of separate bodies). The assembled view downloads separately, for looking at.

## First print: the fit test coupon

Print the fit test kit for your size (`COUPON`, `K`, `S3`, `BS`) in your
material with the matching profile and joint, and have one bolt, one nut,
one bearing and one magnet to hand, plus a gear of your size for the jaws
(any `G20` or bigger) or a dowel pin for the pin joints. Check, in order:

1. The bearing presses into the seat by hand and stays.
2. A nut pushes into either pocket from below and does not turn.
3. The bolt drops through a hole, the spacers slide over it, and the knob's hex pocket grips its head.
4. Jaws (M2 and M1.5): the gear's pockets drop over the three jaws on the bearing block without force, and the gear sits on them with no rocking you can feel. Pin joints (and M1, whose block is too small for the jaws): the dowel pin slides into the holes around the bearing seat with a little play (slip fit), and with the pin joints presses firmly into the hole in the strip (press fit).
5. The magnet presses into its pocket in the strip and stays.
6. The male dovetail of a second coupon (or a tile) slides into the female slot without force and without slop.

If a fit is off, change that one value in `scad/lib/tolerances.scad` (or use
the fit overrides in the web app's Settings) and print the coupon again.

## Print settings

- Tiles: top face down, 0.2 mm layers, 3 walls, 20 percent infill. The web app
  and the catalog render them print-ready (flipped).
- Gears, spacers, bushings, the joint ring: flat side down, 3 walls.
- Knobs and the dial knob: boss down, 3 walls.
- Cranks and pointers: hub ring up (the app renders them that way). The
  joint, the handle and its spacer stand up; the cap prints flat.
- Pawls: flat; PETG flexes best, PLA works for the small deflection.
- Motor mount: legs down; the short tongue over the pinion is a 17 mm bridge.
- Rails flat; carriages, racks and yokes upside down (the app renders them
  that way); the slider post, the Geneva driver and the winch stand up.
- Spring: flat, PETG, 100 percent infill, 2 walls; it is a 1.2 mm band
  (1.0 mm in M1.5).
- Ring gear legs up (the app renders it that way), carrier and flywheel
  flat, bevel gears teeth up (the shaft bevel hub down), worm standing, the
  bracket on its bar, the NEMA 17 mount legs down.
- Everything prints without supports.
