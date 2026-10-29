// gearbox.scad - one entry point for every part. Works in the desktop OpenSCAD
// customizer and from the command line:
//   openscad -D 'size="M1.5"' -D 'part="gear"' -D teeth=40 -o G40.stl gearbox.scad
// BOSL2 must be on the library path (lib/BOSL2 in this repo, or your OpenSCAD
// libraries folder). Run `npm run render` to build the whole catalog.

/* [Part] */
part = "gear"; // [gear, compound, tile, knob, spacer, base_spacer, coupler, bushing, coupon, crank, post, joint, handle, cap, pointer, dial_knob, pulley, link, ratchet, pawl, motor_mount, pinion]

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
flip = false;      // tile, crank, pointer: render print-ready (upside down)

/* [Spacer] */
spacer_h = 3;      // [1:0.5:10]

/* [Add-ons] */
throw = 40;        // [20:10:80] crank: post distance from the axis, mm
post_h = 11;       // [8:1:40] post height above the crank arm; 11 carries a bearing, 28 a handle
level = 1;         // [1:1:3] motor mount: level of the pinion
pulley_n = 40;     // [20:10:80] pulley diameter as a tooth count: MOD x n mm
holes = 3;         // [2:1:6] link: bearing seats, one grid step apart
flip_pawl = false; // pawl for a ratchet that locks the other way

/* [Print profile] */
profile = "PETG"; // [PLA, PETG, ABS]
// single fit overrides, e.g. [["bearing_bore_d", 22.2]]; the web app writes these
overrides = [];

include <lib/standard.scad>
include <lib/gear.scad>
include <lib/pin.scad>
include <lib/board.scad>
include <lib/coupon.scad>
include <lib/addons.scad>
include <lib/motor.scad>

// turn a part that hangs pegs below z = 0 upside down for printing
module print_flip(on, h) { if (on) translate([0, 0, h]) mirror([0, 0, 1]) children(); else children(); }

if (part == "gear")             gear(teeth, face = face);
else if (part == "compound")    compound_gear(teeth, teeth_upper, face = face);
else if (part == "tile")        tile(tile_nx, tile_ny, flip = flip);
else if (part == "knob")        knob();
else if (part == "spacer")      spacer(spacer_h);
else if (part == "base_spacer") base_spacer();
else if (part == "coupler")     coupler_half();
else if (part == "bushing")     bushing();
else if (part == "coupon")      coupon();
else if (part == "crank")       print_flip(flip, ARM_T) crank(throw);
else if (part == "post")        post(post_h);
else if (part == "joint")       joint();
else if (part == "handle")      handle();
else if (part == "cap")         cap();
else if (part == "pointer")     print_flip(flip, HUB_T) pointer();
else if (part == "dial_knob")   dial_knob();
else if (part == "pulley")      pulley(pulley_n);
else if (part == "link")        link(holes);
else if (part == "ratchet")     ratchet();
else if (part == "pawl")        pawl(flip_pawl);
else if (part == "motor_mount") motor_mount(level);
else if (part == "pinion")      pinion();
else assert(false, str("unknown part: ", part));
