// standard.scad - the GearBox part standard, in two sizes. Every dimension that
// two parts must agree on lives here; tolerances.scad holds the print clearances.
//
//   size = "M2"    module 2,   20 mm grid, M8 bolts, 608 bearings (8 x 22 x 7)
//   size = "M1.5"  module 1.5, 15 mm grid, M6 bolts, 606 bearings (6 x 17 x 6)
//
// Both sizes share the tooth counts (20 to 80 in tens), the mesh rule (two
// gears mesh when their tooth counts add up to a multiple of 20) and the
// 2 mm gap between stacked gears that three steel dowel pins bridge.

include <tolerances.scad>

// `size` is set by gearbox.scad (or -D size="M1.5"); M2 when nothing sets it.
SMALL = is_undef(size) ? false : size == "M1.5";

// Gear standard ---------------------------------------------------------------
MOD    = SMALL ? 1.5 : 2;   // module, mm
GRID   = MOD * 10;          // hole pitch: a 20T gear spans two grid steps
GEAR_T = SMALL ? 7 : 8;     // gear face width: bearing width + 1 mm ledge
LEVEL  = GEAR_T + 2;        // vertical pitch between gear levels (2 mm gap between stacked gears)
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

// Coupling: a ring of pin holes in every gear face ----------------------------------
// Steel dowel pins (ISO 2338 / DIN 6325) do every face joint. Three joint pins
// dropped into a gear's top holes reach PIN_DEPTH into the gear above across the
// 2 mm gap and lock the pair; no printed coupler is needed. Cranks and pointers
// carry three shorter pins pressed into their hub ring. The legacy two-half
// peg coupler (CPL) still fits the same holes.
PIN_N     = 6;                      // holes per face, 60 degrees apart
PIN_D     = SMALL ? 2.0 : 3.0;      // pin diameter: 2 mm pins for M1.5, 3 mm for M2
PIN_L     = SMALL ? 6 : 8;          // joint pin length: two PIN_DEPTHs plus the gap, less float
PIN_HUB_L = SMALL ? 4 : 6;          // hub pin length: HUB_T in the ring plus PIN_DEPTH - 0.1 in the gear
PIN_R     = SMALL ? 10.8 : 14.3;    // hole circle radius
PIN_DEPTH = SMALL ? 2.4 : 3.4;      // blind hole depth in a face; both faces leave a web in the middle
PIN_NAME  = SMALL ? "2 x 6 mm" : "3 x 8 mm";
PIN_HUB_NAME = SMALL ? "2 x 4 mm" : "3 x 6 mm";
HUB_T     = PIN_HUB_L - PIN_DEPTH + 0.1;   // hub ring of a crank or pointer: 2.7 / 1.8, under the knob's 3 mm gap
CPL_T     = 0.9;                    // legacy coupler half plate; two halves fill the 2 mm gap with 0.2 to spare
CPL_ID    = BEARING[1] + 1.5;       // clears the bearing outer race
CPL_OD    = SMALL ? 25 : 32;        // hub ring outer diameter, inside the root circle of a 20T gear

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
