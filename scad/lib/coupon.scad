// coupon.scad - the fit test coupon. One small print that checks every fit:
// two bolt sockets with nut pockets, a dovetail pair, a bearing seat and the
// coupler peg holes. Print it with two coupler halves, a knob and a spacer.

include <standard.scad>
include <gear.scad>
include <board.scad>

module coupon() {
    W = 2 * GRID; H = GRID;
    c = fit("slot_clear");
    block = BEARING[1] + 8 * MOD; // bearing seat block, square
    difference() {
        union() {
            // a two-socket strip, same section as a tile, with one male and one female key
            translate([0, 0, SKIRT_H]) cube([W, H, PLATE_T]);
            difference() {
                cube([W, H, SKIRT_H + EPS]);
                translate([WALL_T, WALL_T, -EPS]) cube([W - 2 * WALL_T, H - 2 * WALL_T, SKIRT_H + 3 * EPS]);
            }
            translate([GRID - RIB_T / 2, 0, 0]) cube([RIB_T, H, SKIRT_H + EPS]);
            for (i = [0 : 1]) translate([hole_pos(i), hole_pos(0), SKIRT_H]) socket_boss();
            translate([W, GRID / 2, 0]) rotate(-90) {
                translate([0, 0, 0.6]) linear_extrude(TILE_H - 0.6) dovetail_2d(-c / 2);
                translate([0, 0, 0.6]) mirror([0, 0, 1]) linear_extrude(0.6, scale = 0.9) dovetail_2d(-c / 2);
            }
            // bearing seat block behind the strip
            translate([0, H + 2, 0]) cube([block, block, GEAR_T]);
        }
        for (i = [0 : 1]) translate([hole_pos(i), hole_pos(0), SKIRT_H]) socket_cut();
        translate([0, GRID / 2, -EPS]) rotate(90) linear_extrude(TILE_H + 2 * EPS) dovetail_2d(c / 2);
        translate([block / 2, H + 2 + block / 2, 0]) {
            bearing_seat();
            translate([0, 0, GEAR_T]) peg_holes();
        }
    }
}
