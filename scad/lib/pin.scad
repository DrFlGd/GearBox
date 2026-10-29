// pin.scad - pins, caps, knobs, spacers and sleeves.
//
// Three pin styles share every other part:
//   printed bayonet pin + quarter-turn cap        (no hardware)
//   M8 hex bolt + captive nut in the tile + knob    (cheap, hand removable)
//   M6 hex bolt + captive nut + knob, with a sleeve in each 608 or a 626 bearing

include <standard.scad>
include <spline.scad>

// Printed bayonet pin, printed axle up. z = 0 is the bottom of the lugs.
// levels: how many gear levels the axle carries (1, 2 or 3).
module pin(levels = 1) {
    lug_h = LUG_T - fit("lug_clear");
    boss_h = LUG_T + PLATE_T;                // lug bottom to plate top
    z_flange = boss_h;
    z_shoulder = z_flange + FLANGE_H;
    z_axle = z_shoulder + SHOULDER_H;
    axle_d = fit("axle_d");
    axle_l = LEVEL * levels;
    z_neck = z_axle + axle_l;
    z_head = z_neck + NECK_H;
    union() {
        // lugs with a detent bump on top
        for (s = [0, 180]) rotate(s) {
            translate([0, -LUG_W / 2, 0]) cube([LUG_R, LUG_W, lug_h]);
            translate([LUG_R - 1.5, 0, lug_h]) scale([1, 1, 0.5]) sphere(r = fit("lug_clear") + 0.3, $fn = 24);
        }
        cylinder(d = BOSS_D, h = boss_h);
        // flange with a 45 degree chamfer underneath so it prints without support
        translate([0, 0, z_flange - (FLANGE_D - BOSS_D) / 2])
            cylinder(d1 = BOSS_D, d2 = FLANGE_D, h = (FLANGE_D - BOSS_D) / 2);
        translate([0, 0, z_flange]) cylinder(d = FLANGE_D, h = FLANGE_H);
        translate([0, 0, z_shoulder]) cylinder(d = SHOULDER_D, h = SHOULDER_H);
        translate([0, 0, z_axle]) cylinder(d = axle_d, h = axle_l + EPS);
        translate([0, 0, z_neck]) cylinder(d = NECK_D, h = NECK_H + EPS);
        // double-D head with a lead-in chamfer
        translate([0, 0, z_head]) intersection() {
            union() {
                cylinder(d1 = NECK_D, d2 = HEAD_D, h = (HEAD_D - NECK_D) / 2); // prints over the neck
                translate([0, 0, (HEAD_D - NECK_D) / 2]) cylinder(d = HEAD_D, h = HEAD_H - (HEAD_D - NECK_D) / 2 - 0.6);
                translate([0, 0, HEAD_H - 0.6]) cylinder(d1 = HEAD_D, d2 = HEAD_D - 1.2, h = 0.6);
            }
            translate([-HEAD_D, -HEAD_FLAT / 2, 0]) cube([2 * HEAD_D, HEAD_FLAT, HEAD_H]);
        }
    }
}

// Quarter-turn cap. Printed top up. z = 0 is the bottom of the boss that
// presses the bearing inner race. Drop over the head with the slot aligned,
// push down, twist 90 degrees: the head's round sides now overhang the slot.
// Two shallow ramps on the plate pull the cap down as it turns and drop into
// a pocket at 90 degrees, so it clicks and stays.
module cap() {
    c = fit("slot_clear");
    bore = AXLE_D + fit("bore_clear");
    z_plate = CAP_BOSS_H;
    z_top = CAP_H;
    detent = 0.3;
    difference() {
        union() {
            cylinder(d = SPACER_OD, h = CAP_BOSS_H + EPS);
            translate([0, 0, z_plate]) cylinder(d = CAP_D, h = z_top - z_plate);
        }
        // bore through the boss, up to the plate
        translate([0, 0, -EPS]) cylinder(d = bore, h = z_plate + 2 * EPS);
        // double-D slot through the plate
        translate([0, 0, z_plate - EPS]) linear_extrude(CAP_PLATE_T + 2 * EPS)
            intersection() { circle(d = HEAD_D + c); square([HEAD_D + c, HEAD_FLAT + c], center = true); }
        // opening above the plate where the head sits; wide enough to get a finger nail in
        translate([0, 0, z_plate + CAP_PLATE_T]) cylinder(d = HEAD_D + 0.6, h = z_top);
        // grip scallops
        for (i = [0 : 11]) rotate(i * 30) translate([CAP_D / 2 + 0.6, 0, z_plate + 1])
            cylinder(r = 1.6, h = z_top, $fn = 24);
    }
    // detent ramps on the plate top, between the slot and the opening wall
    // sectors from 56 to 86 degrees either side of +Y and -Y, rising from 0 to `detent`,
    // then nothing at 90 degrees: the head's round lobes climb the ramp and drop in.
    r1 = 3.3; r2 = (HEAD_D + 0.6) / 2 - 0.05;
    for (m = [0, 180]) rotate(m)
        for (a = [56 : 3 : 86])
            rotate(a) translate([0, 0, z_plate + CAP_PLATE_T - EPS])
                sector(r1, r2, 3.2, detent * (a - 53) / 33 + EPS);
}

// Knob for a hex head bolt (DIN 933). The bolt drops in from the top; the hex
// pocket turns it, the boss underneath presses only the bearing inner race.
module knob(bolt = "M8") {
    h = hw(bolt);
    bore = h[0] + fit("bolt_clear");
    af = h[1] + fit("nut_clear");
    pocket = h[2] + 0.2;
    kh = knob_h(bolt);
    difference() {
        union() {
            cylinder(d = SPACER_OD, h = CAP_BOSS_H + EPS);
            translate([0, 0, CAP_BOSS_H]) cylinder(d = CAP_D, h = kh - CAP_BOSS_H);
        }
        translate([0, 0, -EPS]) cylinder(d = bore, h = kh + 2 * EPS);
        translate([0, 0, kh - pocket]) cylinder(d = af / cos(30), h = pocket + EPS, $fn = 6);
        for (i = [0 : 11]) rotate(i * 30) translate([CAP_D / 2 + 0.6, 0, CAP_BOSS_H + 1])
            cylinder(r = 1.6, h = kh, $fn = 24);
    }
}

// Spacer between two bearing inner races (3 mm = one level minus one bearing).
// bore: "608" for an 8 mm axle or M8 bolt, "626" for an M6 bolt with 626 bearings.
module spacer(h = SPACER_H, bore = "608") {
    id = bore == "626" ? M6[0] + fit("bore_clear") : AXLE_D + fit("bore_clear");
    od = bore == "626" ? 9 : SPACER_OD;
    difference() {
        cylinder(d = od, h = h);
        translate([0, 0, -EPS]) cylinder(d = id, h = h + 2 * EPS);
    }
}

// Base spacer for bolt tiles: lifts the first gear 1 mm off the plate.
module base_spacer(bolt = "M8") {
    spacer(h = BASE_SPACER_H, bore = bolt == "M6" ? "626" : "608");
}

// Sleeve that lets an M6 bolt carry a 608: 6.4 in, 7.9 out, one per bearing.
module sleeve_m6() {
    difference() {
        cylinder(d = fit("axle_d"), h = B608[2]);
        translate([0, 0, -EPS]) cylinder(d = M6[0] + fit("bolt_clear"), h = B608[2] + 2 * EPS);
    }
}

// Plain printed bushing that replaces a 608 entirely (cheap kit, or a fixed gear).
module bushing(bolt = "M8") {
    difference() {
        cylinder(d = B608[1] - 0.1, h = B608[2]);
        translate([0, 0, -EPS]) cylinder(d = hw(bolt)[0] + fit("bolt_clear"), h = B608[2] + 2 * EPS);
    }
}
