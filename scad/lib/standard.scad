// standard.scad - the GearBox part standard, in two sizes. Every dimension that
// two parts must agree on lives here; tolerances.scad holds the print clearances.
//
//   size = "M2"    module 2,   20 mm grid, M8 bolts, 608 bearings (8 x 22 x 7)
//   size = "M1.5"  module 1.5, 15 mm grid, M6 bolts, 606 bearings (6 x 17 x 6)
//
// Both sizes share the tooth counts (20 to 80 in tens), the mesh rule (two
// gears mesh when their tooth counts add up to a multiple of 20) and the
// 2 mm gap between stacked gears that the coupler halves fill.

include <tolerances.scad>

// `size` is set by gearbox.scad (or -D size="M1.5"); M2 when nothing sets it.
SMALL = is_undef(size) ? false : size == "M1.5";

// Gear standard ---------------------------------------------------------------
MOD    = SMALL ? 1.5 : 2;   // module, mm
GRID   = MOD * 10;          // hole pitch: a 20T gear spans two grid steps
GEAR_T = SMALL ? 7 : 8;     // gear face width: bearing width + 1 mm ledge
LEVEL  = GEAR_T + 2;        // vertical pitch between gear levels (2 mm gap for a coupler)
PA     = 20;                // pressure angle, degrees

// Hardware ----------------------------------------------------------------------
BEARING = SMALL ? [6, 17, 6] : [8, 22, 7];      // [bore, outside, width]: 606 or 608
BOLT    = SMALL ? [6, 10, 4] : [8, 13, 5.3];    // [thread d, hex across flats, head height] DIN 933
NUT_H   = SMALL ? 5 : 6.5;                      // DIN 934 nut height
BEARING_NAME = SMALL ? "606" : "608";
BOLT_NAME    = SMALL ? "M6" : "M8";
function bearing_bore() = SMALL ? fit("bearing606_bore_d") : fit("bearing_bore_d");

// Board tile (prints top face down) ---------------------------------------------
PLATE_T = SMALL ? 4 : 5;    // flat plate with plain bolt holes
SKIRT_H = SMALL ? 6 : 7;    // rib skirt below the plate; the nut pockets live in it
TILE_H  = PLATE_T + SKIRT_H;
WALL_T  = 2;                // perimeter wall
RIB_T   = 1.2;              // internal ribs on every grid line
BOSS_WALL = 1.6;            // wall around a nut pocket
DOVETAIL = SMALL ? [6, 8.5, 3] : [8, 11, 4]; // edge key: neck width, tail width, depth

// Spacers and knob ----------------------------------------------------------------
SPACER_OD     = SMALL ? 8.5 : 11;   // must press only the bearing inner race
SPACER_H      = LEVEL - BEARING[2]; // 3 mm: fills a level above one bearing
BASE_SPACER_H = 2;                  // under the first bearing, lifts the gear 1 mm off the plate
KNOB_D        = SMALL ? 16 : 20;
KNOB_BOSS_H   = SPACER_H;           // the knob's boss is the last spacer
KNOB_FLOOR    = SMALL ? 2 : 2.5;    // under the bolt head
KNOB_H        = KNOB_BOSS_H + KNOB_FLOOR + BOLT[2] + 0.2;

// Coupling: a ring of peg holes in every gear face ---------------------------------
// Two identical coupler halves (flat rings with three pegs) nest into each other
// in the gap between two stacked gears and pin them together.
PEG_N     = 6;                      // holes per face
PEG_D     = SMALL ? 2.0 : 3.0;      // peg diameter; holes get slot_clear
PEG_R     = SMALL ? 10.8 : 14.3;    // hole circle radius
PEG_DEPTH = SMALL ? 2.0 : 2.5;      // hole depth in the gear face
CPL_T     = 0.9;                    // one half's plate; two halves fill the 2 mm gap with 0.2 to spare
CPL_ID    = BEARING[1] + 1.5;       // clears the bearing outer race
CPL_OD    = SMALL ? 25 : 32;        // stays inside the root circle of a 20T gear

// Derived ---------------------------------------------------------------------
function gear_pr(teeth)   = MOD * teeth / 2;          // pitch radius
function gear_or(teeth)   = MOD * (teeth + 2) / 2;    // tip radius
function gear_rr(teeth)   = MOD * (teeth - 2.5) / 2;  // root radius
function mesh_ok(t1, t2)  = (t1 + t2) % 20 == 0;      // both gears land on the grid
function tile_size(n)     = n * GRID;
function hole_pos(i)      = GRID * i + GRID / 2;
// Bolt length for a pin carrying `levels` gears: plate + nut below, base spacer,
// the levels, and the knob floor above. Round up to the next stock length.
function bolt_len(levels) = PLATE_T + NUT_H + BASE_SPACER_H + LEVEL * levels + KNOB_FLOOR;
function stock_bolt(levels) = let(l = bolt_len(levels)) ceil(l / 5) * 5;

$fn = $preview ? 48 : 96;
EPS = 0.01;
