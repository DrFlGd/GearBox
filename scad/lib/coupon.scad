// coupon.scad - the fit test coupon. One small print that checks every fit:
// a bayonet socket, an M8 and an M6 nut pocket, a 608 seat, a 626 seat and a
// spline socket. Print it with a P1 pin, a cap and a coupler before the kit.

include <standard.scad>
include <spline.scad>
include <board.scad>

module coupon() {
    styles = ["bayonet", "M8", "M6"];
    W = 3 * GRID; H = GRID;
    difference() {
        union() {
            // a one-row strip of three sockets, same section as a tile
            translate([0, 0, SKIRT_H]) cube([W, H, PLATE_T]);
            difference() {
                cube([W, H, SKIRT_H + EPS]);
                translate([WALL_T, WALL_T, -EPS]) cube([W - 2 * WALL_T, H - 2 * WALL_T, SKIRT_H + 3 * EPS]);
            }
            for (k = [1 : 2]) translate([GRID * k - RIB_T / 2, 0, 0]) cube([RIB_T, H, SKIRT_H + EPS]);
            for (i = [0 : 2]) translate([hole_pos(i), hole_pos(0), SKIRT_H]) socket_boss(styles[i]);
            // bearing seat block behind the strip: 608 on the left, 626 on the right
            translate([0, H + 2, 0]) cube([W, 30, GEAR_T]);
        }
        for (i = [0 : 2]) translate([hole_pos(i), hole_pos(0), SKIRT_H]) socket_cut(styles[i]);
        translate([15, H + 2 + 15, 0]) {
            translate([0, 0, -EPS]) cylinder(d = B608[1] - 2, h = 1 + 2 * EPS);
            translate([0, 0, 1]) cylinder(d = fit("bearing_bore_d"), h = GEAR_T);
        }
        translate([45, H + 2 + 15, 0]) {
            translate([0, 0, -EPS]) cylinder(d = B626[1] - 2, h = 1 + 2 * EPS);
            translate([0, 0, 1]) cylinder(d = fit("bearing626_bore_d"), h = GEAR_T);
            translate([0, 0, GEAR_T]) spline_pockets();
        }
    }
}
