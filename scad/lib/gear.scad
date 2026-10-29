// gear.scad - spur gears on the GearBox standard.
//
// Every gear is module 2, 8 mm thick, with a bearing seat in the hub and a spline
// socket on both faces. Tooth counts in multiples of 10 land on the 20 mm grid;
// two gears mesh when their tooth counts add up to a multiple of 20.

include <standard.scad>
include <spline.scad>
include <BOSL2/std.scad>
include <BOSL2/gears.scad>

// Plain gear blank with teeth. z = 0 is the bottom face.
module gear_blank(teeth, thickness = GEAR_T) {
    spur_gear(mod = MOD, teeth = teeth, thickness = thickness, pressure_angle = PA,
              backlash = fit("backlash"), anchor = BOTTOM);
}

// Bearing seat: the bearing sits on a 1 mm ledge at the bottom of the seat.
// The ledge opening touches only the outer race.
module bearing_seat(bearing = "608", ledge_at_bottom = true) {
    d = bearing_dims(bearing);
    bore = bearing_bore(bearing);
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

// Web cutouts between the hub and the rim. Only gears of 40T and up have a web.
module face_pattern(teeth, face, thickness = GEAR_T) {
    r_hub = SPLINE_RO + 2;
    r_rim = gear_rr(teeth) - 3;
    if (r_rim - r_hub >= 8 && face != "solid") {
        translate([0, 0, -EPS]) linear_extrude(thickness + 2 * EPS) {
            if (face == "spokes" || face == "cross") {
                n = face == "spokes" ? 6 : 4;
                w = face == "spokes" ? 5 : 6;
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
module gear(teeth, face = "solid", bearing = "608") {
    assert(teeth % 10 == 0 && teeth >= 20, "teeth must be 20, 30, 40 ... 80");
    difference() {
        gear_blank(teeth);
        bearing_seat(bearing);
        translate([0, 0, GEAR_T]) spline_pockets();
        mirror([0, 0, 1]) spline_pockets();
        face_pattern(teeth, face);
    }
}

// Two gears on one hub, one level apart. The lower gear is the larger one.
// Bottom bearing seats from below, top bearing from above; a 2 mm wall sits between.
// Total height is 17 mm: lower teeth at 0..8, upper teeth at 9..17.
module compound_gear(teeth_lower, teeth_upper, face = "solid", bearing = "608") {
    assert(teeth_lower > teeth_upper, "the lower gear of a compound must be the larger one");
    h_upper = LEVEL + GEAR_T - 1; // 17
    difference() {
        union() {
            gear_blank(teeth_lower);
            translate([0, 0, GEAR_T]) cylinder(r = gear_rr(teeth_upper), h = 1 + EPS); // bridge the 1 mm gap
            translate([0, 0, GEAR_T + 1]) gear_blank(teeth_upper);
        }
        bearing_seat(bearing, ledge_at_bottom = false);                 // lower: bearing 0..7, ledge 7..8
        translate([0, 0, LEVEL - 1]) bearing_seat(bearing);              // upper: ledge 9..10, bearing 10..17
        translate([0, 0, h_upper]) spline_pockets();
        mirror([0, 0, 1]) spline_pockets();
        face_pattern(teeth_lower, face);
    }
}

// Spline coupler: joins two stacked gears so they turn together.
// A 0.8 mm web sits in the 1 mm gap between the gears; teeth reach into both sockets.
module coupler() {
    web = 0.8;
    t = SPLINE_DEPTH - 0.4;
    translate([0, 0, t]) {
        difference() {
            cylinder(r = SPLINE_RO + 1, h = web);
            translate([0, 0, -EPS]) cylinder(r = SPLINE_RI - 1, h = web + 2 * EPS);
        }
        translate([0, 0, web]) spline_teeth(t);
        mirror([0, 0, 1]) spline_teeth(t);
    }
}
