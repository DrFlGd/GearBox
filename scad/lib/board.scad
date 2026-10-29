// board.scad - interlocking board tiles.
//
// A tile is nx by ny bolt sockets on the grid: a flat plate with plain holes
// on top, a rib skirt underneath with a captive nut pocket under every hole.
// Print it top face down: the flat top gets the bed finish and every pocket,
// rib and dovetail grows straight up with no support. Nuts push into the
// pockets from below; the bolt comes down through the gear stack into them.
// Edges carry vertical dovetail keys that alternate male and female so any
// two tiles drop together on any edge.

include <standard.scad>

// Everything removed from the tile for one socket, centred on the origin,
// z = 0 at the plate underside, z = PLATE_T at the plate top.
module socket_cut() {
    bolt = BOLT[0] + fit("bolt_clear");
    af = BOLT[1] + fit("nut_clear");
    translate([0, 0, -SKIRT_H - EPS]) cylinder(d = bolt, h = TILE_H + 2 * EPS);
    // nut pocket: open at the skirt bottom, ceiling is the plate underside
    translate([0, 0, -SKIRT_H - EPS]) cylinder(d = af / cos(30), h = SKIRT_H + EPS, $fn = 6);
}

// Boss under the plate that carries a nut pocket.
module socket_boss() {
    af = BOLT[1] + fit("nut_clear");
    translate([0, 0, -SKIRT_H]) cylinder(d = af / cos(30) + 2 * BOSS_WALL, h = SKIRT_H + EPS, $fn = 24);
}

// Dovetail key profile in XY: neck on the tile edge (y = 0), tail at y = depth.
// grow: added all round for the female cut.
module dovetail_2d(grow = 0) {
    n = DOVETAIL[0] + 2 * grow; t = DOVETAIL[1] + 2 * grow; d = DOVETAIL[2] + grow;
    polygon([[-n / 2, -grow - EPS], [n / 2, -grow - EPS], [t / 2, d], [-t / 2, d]]);
}

// Which key goes at index i of m positions along one edge:
// 1 = male, -1 = female, 0 = none. Two tiles meet edge to edge with one edge
// reversed, so the pattern must be its own complement when reversed:
// key_kind(m - 1 - i) == -key_kind(i). The first half alternates male, female,
// ...; the second half mirrors it with the kinds swapped; an odd middle is
// skipped. (A 2-socket edge has one position, the middle, and gets no key.)
// m = 3: male, none, female.  m = 4: male, female, male, female.
// m = 5: male, female, none, male, female.
function key_kind(i, m) =
    i < floor(m / 2) ? (i % 2 == 0 ? 1 : -1)
    : (m % 2 == 1 && i == (m - 1) / 2) ? 0
    : -key_kind(m - 1 - i, m);

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

// The tile as used: top face up at z = TILE_H. (Flip it in the slicer, or
// render with `flip = true` to get it print-ready with the top on the bed.)
module tile(nx = 4, ny = 4, flip = false) {
    W = tile_size(nx); H = tile_size(ny);
    keys = edge_keys(nx, ny);
    c = fit("slot_clear");
    translate(flip ? [0, H, TILE_H] : [0, 0, 0]) rotate(flip ? [180, 0, 0] : [0, 0, 0])
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
            // nut pocket bosses
            for (i = [0 : nx - 1], j = [0 : ny - 1])
                translate([hole_pos(i), hole_pos(j), SKIRT_H]) socket_boss();
            // male keys, full height, with a chamfer on the bottom end so they slide in
            for (key = keys) if (key[3] == 1)
                translate([key[0], key[1], 0]) rotate(key[2] - 90) {
                    translate([0, 0, 0.6]) linear_extrude(TILE_H - 0.6) dovetail_2d(-c / 2);
                    translate([0, 0, 0.6]) mirror([0, 0, 1]) linear_extrude(0.6, scale = 0.9) dovetail_2d(-c / 2);
                }
        }
        // sockets
        for (i = [0 : nx - 1], j = [0 : ny - 1])
            translate([hole_pos(i), hole_pos(j), SKIRT_H]) socket_cut();
        // female keys
        for (key = keys) if (key[3] == -1)
            translate([key[0], key[1], -EPS]) rotate(key[2] + 90) linear_extrude(TILE_H + 2 * EPS) dovetail_2d(c / 2);
    }
}
