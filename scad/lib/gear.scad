// gear.scad - spur gears on the GearBox standard.
//
// Every gear has a bearing seat in the hub and a ring of peg holes on both
// faces for the coupler halves (and, later, cranks and pointers). Tooth counts
// in multiples of 10 land on the grid; two gears mesh when their tooth counts
// add up to a multiple of 20. Gears print flat, either face down.

include <standard.scad>
include <BOSL2/std.scad>
include <BOSL2/gears.scad>

// Plain gear blank with teeth. z = 0 is the bottom face.
module gear_blank(teeth, thickness = GEAR_T) {
    spur_gear(mod = MOD, teeth = teeth, thickness = thickness, pressure_angle = PA,
              backlash = fit("backlash"), anchor = BOTTOM);
}

// Bearing seat: the bearing sits on a 1 mm ledge at the bottom of the seat.
// The ledge opening touches only the outer race.
module bearing_seat(ledge_at_bottom = true) {
    d = BEARING;
    bore = bearing_bore();
    ledge_id = d[1] - 2;
    if (ledge_at_bottom) {
        translate([0, 0, -EPS]) cylinder(d = ledge_id, h = 1 + 2 * EPS);
        translate([0, 0, 1]) cylinder(d = bore, h = d[2] + 1);
    } else {
        // mirrored: bearing inserted from below, ledge on top
        translate([0, 0, -1]) cylinder(d = bore, h = d[2] + 1);
        translate([0, 0, d[2] - EPS]) cylinder(d = ledge_id, h = 1 + 2 * EPS);
    }
}

// Peg holes in a face. z = 0 is the face, holes go down to -PEG_DEPTH.
module peg_holes() {
    d = PEG_D + fit("slot_clear");
    translate([0, 0, -PEG_DEPTH])
        for (i = [0 : PEG_N - 1]) rotate(i * 360 / PEG_N) translate([PEG_R, 0, 0]) cylinder(d = d, h = PEG_DEPTH + EPS, $fn = 32);
}

// Web cutouts between the hub and the rim. Only gears with a wide enough rim get one.
module face_pattern(teeth, face, thickness = GEAR_T) {
    r_hub = PEG_R + PEG_D / 2 + 2;
    r_rim = gear_rr(teeth) - 3;
    if (r_rim - r_hub >= 4 * MOD && face != "solid") {
        translate([0, 0, -EPS]) linear_extrude(thickness + 2 * EPS) {
            if (face == "spokes" || face == "cross") {
                n = face == "spokes" ? 6 : 4;
                w = (face == "spokes" ? 5 : 6) * MOD / 2;
                difference() {
                    circle(r = r_rim);
                    circle(r = r_hub);
                    for (i = [0 : n - 1]) rotate(i * 360 / n) translate([0, -w / 2]) square([r_rim, w]);
                }
            } else if (face == "holes") {
                n = teeth >= 60 ? 8 : 6;
                rm = (r_hub + r_rim) / 2;
                dh = min((r_rim - r_hub) * 0.8, 2 * PI * rm / n * 0.65);
                for (i = [0 : n - 1]) rotate(i * 360 / n) translate([rm, 0]) circle(d = dh);
            }
        }
    }
    if (face == "spiral" && gear_rr(teeth) - r_hub > 4) {
        // a shallow engraved spiral on the top face, like the reference prints
        groove = 1.2; depth = 0.6;
        r0 = r_hub; r1 = gear_rr(teeth) - 2;
        turns = floor((r1 - r0) / 3);
        pts = [for (a = [0 : 6 : 360 * turns]) let(r = r0 + (r1 - r0) * a / (360 * turns)) [r * cos(a), r * sin(a)]];
        translate([0, 0, thickness - depth]) linear_extrude(depth + EPS) stroke(pts, width = groove);
    }
}

// A single gear. z = 0 is the bottom face; the bearing seats from the top.
module gear(teeth, face = "solid") {
    assert(teeth % 10 == 0 && teeth >= 20, "teeth must be 20, 30, 40 ... 80");
    difference() {
        gear_blank(teeth);
        bearing_seat();
        translate([0, 0, GEAR_T]) peg_holes();
        mirror([0, 0, 1]) peg_holes();
        face_pattern(teeth, face);
    }
}

// Two gears on one hub, one level apart. The lower gear is the larger one.
// Bottom bearing seats from below, top bearing from above; a 2 mm wall sits
// between them. Lower teeth 0..GEAR_T, upper teeth GEAR_T+1..LEVEL+GEAR_T-1.
module compound_gear(teeth_lower, teeth_upper, face = "solid") {
    assert(teeth_lower > teeth_upper, "the lower gear of a compound must be the larger one");
    h_upper = LEVEL + GEAR_T - 1;
    difference() {
        union() {
            gear_blank(teeth_lower);
            translate([0, 0, GEAR_T]) cylinder(r = gear_rr(teeth_upper), h = 1 + EPS); // bridge the 1 mm gap
            translate([0, 0, GEAR_T + 1]) gear_blank(teeth_upper);
        }
        bearing_seat(ledge_at_bottom = false);              // lower: bearing from below, ledge on top
        translate([0, 0, LEVEL - 1]) bearing_seat();        // upper: ledge, then bearing from above
        translate([0, 0, h_upper]) peg_holes();
        mirror([0, 0, 1]) peg_holes();
        face_pattern(teeth_lower, face);
    }
}

// Coupler half: a flat ring with three pegs up and three holes between them.
// Print two. Drop one on the lower gear pegs down, the other on top of it
// flipped and turned 60 degrees: each half's pegs pass through the other's
// holes into the gear beyond, and the two gears turn as one.
module coupler_half() {
    c = fit("slot_clear");
    peg_h = CPL_T + PEG_DEPTH - 0.3;
    difference() {
        union() {
            cylinder(d = CPL_OD, h = CPL_T);
            for (i = [0, 2, 4]) rotate(i * 360 / PEG_N) translate([PEG_R, 0, 0]) {
                cylinder(d = PEG_D, h = peg_h - 0.4, $fn = 32);
                translate([0, 0, peg_h - 0.4]) cylinder(d1 = PEG_D, d2 = PEG_D - 0.8, h = 0.4, $fn = 32);
            }
        }
        translate([0, 0, -EPS]) cylinder(d = CPL_ID, h = CPL_T + 2 * EPS);
        for (i = [1, 3, 5]) rotate(i * 360 / PEG_N) translate([PEG_R, 0, -EPS]) cylinder(d = PEG_D + c, h = CPL_T + 2 * EPS, $fn = 32);
    }
}
