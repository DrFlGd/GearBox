// gearbox.scad - one entry point for every part. Works in the desktop OpenSCAD
// customizer and from the command line:
//   openscad -D 'part="gear"' -D teeth=40 -D 'face="spokes"' -o G40.3mf gearbox.scad
// BOSL2 must be on the library path (lib/BOSL2 in this repo, or your OpenSCAD
// libraries folder). Run `npm run render` to build the whole catalog.

/* [Part] */
part = "gear"; // [gear, compound, tile, pin, cap, knob, spacer, base_spacer, coupler, sleeve_m6, bushing, coupon]

/* [Gear] */
teeth = 40;        // [20:10:80]
teeth_upper = 20;  // [20:10:80] compound only: the smaller gear on top
face = "solid";    // [solid, spokes, cross, holes, spiral]
bearing = "608";   // [608, 626]

/* [Tile] */
tile_nx = 4;       // [2:1:8]
tile_ny = 4;       // [2:1:8]
socket = "bayonet"; // [bayonet, M8, M6]

/* [Pin and hardware] */
levels = 1;        // [1, 2, 3] printed pin height in gear levels
bolt = "M8";       // [M8, M6] knob, base spacer and bushing
spacer_h = 3;      // [1:0.5:10]

/* [Print profile] */
// profile and overrides live in lib/tolerances.scad; set profile here for the customizer
// profile = "PETG"; // [PLA, PETG, ABS]

include <lib/standard.scad>
include <lib/gear.scad>
include <lib/pin.scad>
include <lib/board.scad>
include <lib/coupon.scad>

if (part == "gear")             gear(teeth, face = face, bearing = bearing);
else if (part == "compound")    compound_gear(teeth, teeth_upper, face = face, bearing = bearing);
else if (part == "tile")        tile(tile_nx, tile_ny, socket = socket);
else if (part == "pin")         pin(levels);
else if (part == "cap")         cap();
else if (part == "knob")        knob(bolt);
else if (part == "spacer")      spacer(spacer_h, bore = bolt == "M6" ? "626" : "608");
else if (part == "base_spacer") base_spacer(bolt);
else if (part == "coupler")     coupler();
else if (part == "sleeve_m6")   sleeve_m6();
else if (part == "bushing")     bushing(bolt);
else if (part == "coupon")      coupon();
else assert(false, str("unknown part: ", part));
