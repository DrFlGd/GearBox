// board.scad - interlocking board tiles.
//
// A tile is nx by ny sockets on the 20 mm grid, a 5 mm plate on a 7 mm rib
// skirt. Edges carry vertical dovetail keys that alternate male and female so
// any two tiles drop together on any edge. The socket style picks the pin:
//   "bayonet"  12.4 mm hole with two keyways for the printed pin
//   "M8"       8.4 mm hole with a captive M8 nut pocket, loaded from the top
//   "M6"       6.4 mm hole with a captive M6 nut pocket

include <standard.scad>

// Everything removed from the tile for one socket, centred on the origin,
// z = 0 at the plate underside, z = PLATE_T at the plate top.
module socket_cut(style = "bayonet") {
    if (style == "bayonet") {
        d = BOSS_D + fit("hole_clear");
        kw = LUG_W + fit("slot_clear");
        translate([0, 0, -EPS]) cylinder(d = d, h = PLATE_T + 2 * EPS);
        for (s = [0, 180]) rotate(s) translate([0, -kw / 2, -EPS]) cube([LUG_R + 0.3, kw, PLATE_T + 2 * EPS]);
        translate([0, 0, PLATE_T - 1]) cylinder(d1 = d, d2 = d + 2, h = 1 + EPS); // lead-in chamfer
        // detent dimples under the plate at the locked position (90 degrees from the keyways)
        for (s = [90, 270]) rotate(s) translate([LUG_R - 1.5, 0, 0]) scale([1, 1, 0.5]) sphere(r = 0.6, $fn = 24);
    } else {
        h = hw(style);
        bolt = h[0] + fit("bolt_clear");
        af = h[1] + fit("nut_clear");
        pocket = h[2] + 0.2;
        translate([0, 0, -SKIRT_H]) cylinder(d = bolt, h = TILE_H + 2 * EPS);
        translate([0, 0, PLATE_T - pocket]) cylinder(d = af / cos(30), h = pocket + EPS, $fn = 6);
    }
}

// Boss under the plate that gives a nut pocket its floor (bolt styles only).
module socket_boss(style) {
    if (style != "bayonet") {
        h = hw(style);
        af = h[1] + fit("nut_clear");
        floor_t = 2.4;
        pocket = h[2] + 0.2;
        boss_h = max(0, pocket - PLATE_T) + floor_t;
        translate([0, 0, -boss_h]) cylinder(d = af / cos(30) + 2 * 1.6, h = boss_h + EPS, $fn = 24);
    }
}

// Dovetail key profile in XY: neck on the tile edge (y = 0), tail at y = depth.
// grow: added all round for the female cut.
module dovetail_2d(grow = 0) {
    n = DOVETAIL[0] + 2 * grow; t = DOVETAIL[1] + 2 * grow; d = DOVETAIL[2] + grow;
    polygon([[-n / 2, -grow - EPS], [n / 2, -grow - EPS], [t / 2, d], [-t / 2, d]]);
}

// Which key goes at index i of m positions along one edge:
// 1 = male, -1 = female, 0 = none. Alternating, with the middle skipped when m
// is odd, so an edge mates with the reversed copy of itself.
function key_kind(i, m) = (m % 2 == 1 && i == (m - 1) / 2) ? 0 : (i % 2 == 0 ? 1 : -1);

// Positions along the tile edges, walking counter-clockwise: [x, y, angle, kind]
// angle is the outward normal of that edge.
function edge_keys(nx, ny) =
    let(W = tile_size(nx), H = tile_size(ny))
    [
        for (k = [1 : nx - 1]) [GRID * k,     0, -90, key_kind(k - 1, nx - 1)],  // bottom, +x
        for (k = [1 : ny - 1]) [W, GRID * k,       0, key_kind(k - 1, ny - 1)],  // right, +y
        for (k = [1 : nx - 1]) [W - GRID * k, H,  90, key_kind(k - 1, nx - 1)],  // top, -x
        for (k = [1 : ny - 1]) [0, H - GRID * k, 180, key_kind(k - 1, ny - 1)],  // left, -y
    ];

module tile(nx = 4, ny = 4, socket = "bayonet") {
    W = tile_size(nx); H = tile_size(ny);
    keys = edge_keys(nx, ny);
    c = fit("slot_clear");
    difference() {
        union() {
            // plate
            translate([0, 0, SKIRT_H]) cube([W, H, PLATE_T]);
            // perimeter wall
            difference() {
                cube([W, H, SKIRT_H + EPS]);
                translate([WALL_T, WALL_T, -EPS]) cube([W - 2 * WALL_T, H - 2 * WALL_T, SKIRT_H + 3 * EPS]);
            }
            // ribs on every interior grid line
            for (k = [1 : nx - 1]) translate([GRID * k - RIB_T / 2, 0, 0]) cube([RIB_T, H, SKIRT_H + EPS]);
            for (k = [1 : ny - 1]) translate([0, GRID * k - RIB_T / 2, 0]) cube([W, RIB_T, SKIRT_H + EPS]);
            // nut pocket floors
            for (i = [0 : nx - 1], j = [0 : ny - 1])
                translate([hole_pos(i), hole_pos(j), SKIRT_H]) socket_boss(socket);
            // male keys, full height, with a bottom chamfer so they slide in
            for (key = keys) if (key[3] == 1)
                translate([key[0], key[1], 0]) rotate(key[2] - 90) {
                    translate([0, 0, 0.6]) linear_extrude(TILE_H - 0.6) dovetail_2d(-c / 2);
                    linear_extrude(0.6, scale = 1) offset(delta = -0.6) dovetail_2d(-c / 2);
                }
        }
        // sockets
        for (i = [0 : nx - 1], j = [0 : ny - 1])
            translate([hole_pos(i), hole_pos(j), SKIRT_H]) socket_cut(socket);
        // female keys
        for (key = keys) if (key[3] == -1)
            translate([key[0], key[1], -EPS]) rotate(key[2] + 90) linear_extrude(TILE_H + 2 * EPS) dovetail_2d(c / 2);
    }
}
