// standard.scad - the GearBox part standard. Every dimension that two parts
// must agree on lives here; tolerances.scad holds the print clearances.

include <tolerances.scad>

// Gear standard ---------------------------------------------------------------
MOD   = 2;      // module, mm
GRID  = 20;     // hole pitch, mm (= 10 * MOD, so a 20T gear spans 2 grid steps)
LEVEL = 10;     // vertical pitch between gear levels, mm
GEAR_T = 8;     // gear face width (7 mm bearing + 1 mm ledge)
PA    = 20;     // pressure angle, degrees

// Bearings [bore, outside, width]
B608 = [8, 22, 7];
B626 = [6, 19, 6];

// Board tile ------------------------------------------------------------------
PLATE_T = 5;    // plate thickness
SKIRT_H = 7;    // rib skirt below the plate
TILE_H  = PLATE_T + SKIRT_H;
WALL_T  = 2;    // perimeter wall
RIB_T   = 1.2;  // internal ribs on every grid line
DOVETAIL = [8, 11, 4]; // edge key: neck width, tail width, depth

// Printed pin -----------------------------------------------------------------
AXLE_D     = 8;     // nominal; the printed size comes from fit("axle_d")
BOSS_D     = 12;    // fills the socket
LUG_W      = 4;     // bayonet lug width
LUG_T      = 2.5;   // bayonet lug thickness (before lug_clear)
LUG_R      = 8.5;   // lug reach from the axis
FLANGE_D   = 16;
FLANGE_H   = 2;
SHOULDER_D = 11;    // presses only the bearing inner race (12.1 mm od on a 608)
SHOULDER_H = 2;
NECK_D     = 5;     // must pass the cap slot's narrow side (HEAD_FLAT)
NECK_H     = 2.2;
HEAD_D     = 8;
HEAD_FLAT  = 5;     // double-D head, across flats
HEAD_H     = 3;

// Cap, knob, spacers ----------------------------------------------------------
CAP_D       = 20;
CAP_PLATE_T = 2;
CAP_BOSS_H  = 3;    // doubles as the last spacer
CAP_H       = CAP_BOSS_H + CAP_PLATE_T + HEAD_H + 0.2;
KNOB_FLOOR  = 2.5;  // under the bolt head, above the boss
function knob_h(bolt) = CAP_BOSS_H + KNOB_FLOOR + hw(bolt)[2] + 0.2;
SPACER_OD   = 11;   // anything between two inner races must stay under 12 mm
SPACER_H    = LEVEL - B608[2]; // 3 mm
BASE_SPACER_H = 2;  // under the first gear on a bolt tile (no flange there)

// Spline socket on every gear face: 12 castellated pockets ----------------------
SPLINE_RI = 13;
SPLINE_RO = 16;
SPLINE_DEPTH = 3;
SPLINE_N = 12;

// Hardware [thread d, hex across flats, hex height] ------------------------------
M8 = [8, 13, 6.5];
M6 = [6, 10, 5];
function hw(bolt) = bolt == "M6" ? M6 : M8;

// Derived ---------------------------------------------------------------------
function gear_pr(teeth)   = MOD * teeth / 2;          // pitch radius
function gear_or(teeth)   = MOD * (teeth + 2) / 2;    // tip radius
function gear_rr(teeth)   = MOD * (teeth - 2.5) / 2;  // root radius
function mesh_ok(t1, t2)  = (t1 + t2) % 20 == 0;      // both gears land on the grid
function pin_axle_len(levels) = LEVEL * levels + NECK_H + HEAD_H;
function tile_size(n)     = n * GRID;
function hole_pos(i)      = GRID * i + GRID / 2;
function bearing_bore(b)  = b == "626" ? fit("bearing626_bore_d") : fit("bearing_bore_d");
function bearing_dims(b)  = b == "626" ? B626 : B608;

$fn = $preview ? 48 : 96;
EPS = 0.01;
