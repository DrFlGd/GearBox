# GearBox

A modular, 3D printed gear board: interlocking tiles with a 20 mm grid of pin
sockets, module 2 gears riding on 608 bearings, and a web app (coming) that
generates parts and tests layouts. The plan lives in
[Gear Board Generator Plan](https://claude.ai/artifact/VEH5Cni2EtvSYfoMdG2Zfw).

## The standard

| | |
| --- | --- |
| Module | 2 mm, 20 degree pressure angle |
| Grid | 20 mm hole pitch |
| Gears | 20T to 80T in steps of 10; 8 mm thick; two gears mesh when their tooth counts add up to a multiple of 20 |
| Levels | 10 mm apart; pins carry 1, 2 or 3 levels |
| Bearing | 608 (8 x 22 x 7) pressed into every gear hub; 626 optional for M6 bolts |
| Coupling | 12 pocket spline socket on both faces of every gear, for cranks, couplers and compound stacks |

Three pin styles share every other part. Pick one per tile with `socket=`:

| Socket | Pin | Top |
| --- | --- | --- |
| `bayonet` | printed pin, quarter-turn lock under the plate | printed quarter-turn cap |
| `M8` | M8 hex bolt (DIN 933) into a captive nut dropped into the tile from the top | printed knob `K8` |
| `M6` | M6 hex bolt into a captive nut, with an `SLV6` sleeve in each 608 or a 626 bearing | printed knob `K6` |

## Files

```
scad/gearbox.scad      one entry point for every part (desktop customizer or -D on the CLI)
scad/lib/standard.scad every shared dimension
scad/lib/tolerances.scad  print profiles: PLA, PETG, ABS; every clearance in one table
scad/lib/board.scad    tiles, sockets, dovetail edges
scad/lib/pin.scad      pin, cap, knob, spacers, sleeve, bushing
scad/lib/gear.scad     gears, compound gears, coupler, face patterns
scad/lib/spline.scad   the spline socket and teeth
scad/lib/coupon.scad   the fit test coupon
catalog/parts.json     every stock part with its parameters and expected size
tools/render.mjs       render one part with OpenSCAD (WASM, Manifold backend)
tools/render-catalog.mjs  render and check the whole catalog
tools/preview.mjs      screenshot STLs with three.js in headless Chromium
lib/BOSL2              git submodule, the gear library
```

## Rendering

No OpenSCAD install needed: the tools run the same WebAssembly build the web
app will use (OpenSCAD 2025.01, Manifold backend).

```sh
git clone --recurse-submodules https://github.com/DrFlGd/GearBox
npm install
npm run render -- --profile PETG          # every catalog part to out/PETG/*.stl
npm run render -- --only COUPON,P1,C,CPL  # just the fit test kit
npm run part -- -o out/G40.3mf -D 'part="gear"' -D teeth=40 -D 'face="spokes"'
```

In desktop OpenSCAD, open `scad/gearbox.scad` and use the customizer. BOSL2
must be on your library path: either install it in your OpenSCAD libraries
folder or set `OPENSCADPATH` to this repo's `lib` folder.

## First print: the fit test coupon

Print `COUPON`, `P1`, `C` and `CPL` in your material, with the matching
profile. Check, in order:

1. A 608 presses into the left seat by hand and stays; a 626 into the right seat.
2. The pin drops into the bayonet socket, turns 90 degrees and clicks; it should not wobble.
3. An M8 nut drops into the middle pocket and an M6 nut into the right one, neither turns.
4. The cap drops over the pin head, turns 90 degrees and clicks; the pin's axle slides through a 608 bore.
5. The coupler's teeth drop into the spline pockets with a little play.

If a fit is off, change that one value in `scad/lib/tolerances.scad` (or pass
`-D 'overrides=[["axle_d", 7.95]]'`) and print the coupon again.

## Print settings

- Gears, tiles, spacers: PLA or PETG, 0.2 mm layers, 3 walls, 20 percent infill, flat side down.
- Pins: PETG (or ABS), axle up, 4 walls, 0.2 mm layers. The lugs are the first layer.
- Caps and knobs: top up, 3 walls.
- Everything prints without supports.
