// gearbox.scad - one entry point for every part. Works in the desktop OpenSCAD
// customizer and from the command line:
//   openscad -D 'size="M1.5"' -D 'part="gear"' -D teeth=40 -o G40.stl gearbox.scad
// BOSL2 must be on the library path (lib/BOSL2 in this repo, or your OpenSCAD
// libraries folder). Run `npm run render` to build the whole catalog.

/* [Part] */
part = "gear"; // [gear, compound, tile, knob, spacer, base_spacer, coupler, bushing, coupon]

/* [Size] */
// M2: module 2, 20 mm grid, M8 bolts, 608 bearings. M1.5: module 1.5, 15 mm grid, M6 bolts, 606 bearings.
size = "M2"; // [M2, M1.5]

/* [Gear] */
teeth = 40;        // [20:10:80]
teeth_upper = 20;  // [20:10:80] compound only: the smaller gear on top
face = "solid";    // [solid, spokes, cross, holes, spiral]

/* [Tile] */
tile_nx = 4;       // [2:1:8]
tile_ny = 4;       // [2:1:8]
flip = false;      // render the tile top face down, ready to print

/* [Spacer] */
spacer_h = 3;      // [1:0.5:10]

/* [Print profile] */
profile = "PETG"; // [PLA, PETG, ABS]
// single fit overrides, e.g. [["bearing_bore_d", 22.2]]; the web app writes these
overrides = [];

include <lib/standard.scad>
include <lib/gear.scad>
include <lib/pin.scad>
include <lib/board.scad>
include <lib/coupon.scad>

if (part == "gear")             gear(teeth, face = face);
else if (part == "compound")    compound_gear(teeth, teeth_upper, face = face);
else if (part == "tile")        tile(tile_nx, tile_ny, flip = flip);
else if (part == "knob")        knob();
else if (part == "spacer")      spacer(spacer_h);
else if (part == "base_spacer") base_spacer();
else if (part == "coupler")     coupler_half();
else if (part == "bushing")     bushing();
else if (part == "coupon")      coupon();
else assert(false, str("unknown part: ", part));
