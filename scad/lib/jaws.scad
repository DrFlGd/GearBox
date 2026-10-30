// jaws.scad - a test of jaw faces for joining stacked gears without pins (M2).
//
// Three crescent jaws stand on a gear's top face; three matching pockets are cut
// in its bottom face. Any jaw gear stacks on any other: the upper gear's pockets
// drop over the lower gear's jaws across the 2 mm gap between levels. Both gears
// keep their own bearing, so the jaws carry only the torque. The jaws grow
// straight up from the top face and the pockets' ceilings are short bridges, so
// the gear prints bottom down with no supports.
//
// The jaws sit on the hub between the bearing seat and the root circle of the
// smallest jaw gear (20T), so every jaw gear fits every other.

include <standard.scad>
include <gear.scad>

JAW_N      = 3;
JAW_ARC    = 40;                                  // degrees of arc per jaw
JAW_CLEAR  = fit("slot_clear");                   // all round the jaw in its pocket
JAW_R_IN   = bearing_bore() / 2 + 1.5;
JAW_R_OUT  = gear_rr(20) - 1.5;
JAW_ENGAGE = 2.5;                                 // how far a jaw reaches into the pocket above
JAW_H      = (LEVEL - GEAR_T) + JAW_ENGAGE;       // above the top face
JAW_POCKET = JAW_ENGAGE + 0.5;                    // pocket depth: the jaw never bottoms out
JAW_CHAMFER = 0.5;

module jaw_2d(grow = 0) offset(delta = grow) intersection() {
    difference() { circle(r = JAW_R_OUT); circle(r = JAW_R_IN); }
    polygon([[0, 0], for (a = [-JAW_ARC / 2 : JAW_ARC / 8 : JAW_ARC / 2]) 2 * JAW_R_OUT * [cos(a), sin(a)]]);
}

// A chamfer in steps (the crescent is not convex, so no hull): `steps` slices,
// each `c / steps` tall, the outline shrinking from `grow0` by c in all.
module jaw_steps(c, grow0, sign, steps = 4)
    for (k = [0 : steps - 1]) translate([0, 0, k * c / steps]) linear_extrude(c / steps + EPS) jaw_2d(grow0 + sign * c * (k + 1) / steps);

// one jaw standing on z = 0, its top edges chamfered so the pocket finds it
module jaw() {
    linear_extrude(JAW_H - JAW_CHAMFER) jaw_2d();
    translate([0, 0, JAW_H - JAW_CHAMFER]) jaw_steps(JAW_CHAMFER, 0, -1);
}

// one pocket cut up from z = 0, its mouth chamfered against the first layer's squish
module jaw_pocket() {
    translate([0, 0, -EPS]) linear_extrude(JAW_POCKET + EPS) jaw_2d(JAW_CLEAR);
    translate([0, 0, -EPS]) jaw_steps(JAW_CHAMFER, JAW_CLEAR + JAW_CHAMFER + JAW_CHAMFER / 4, -1);
}

module jaw_gear(teeth = 40, face = "solid") {
    assert(size == "M2", "jaw gears are a test in M2 only for now");
    assert(teeth % 10 == 0 && teeth >= 20, "teeth must be 20, 30, 40 ... 80");
    assert(JAW_R_OUT - JAW_R_IN >= 3, "no room for the jaws on the hub");
    difference() {
        union() {
            gear_blank(teeth);
            for (i = [0 : JAW_N - 1]) rotate(i * 360 / JAW_N) translate([0, 0, GEAR_T - EPS]) jaw();
        }
        bearing_seat();
        for (i = [0 : JAW_N - 1]) rotate(i * 360 / JAW_N) jaw_pocket();
        face_pattern(teeth, face);
    }
}
