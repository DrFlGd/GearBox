// addons.scad - phase 4a: what rides on a gear face or a pin besides gears.
//
//   crank(throw)       hub ring that pegs into a gear's top face, with a thick
//                      arm and a press-fit socket for a post at `throw` mm
//   post(h)            the post: a bearing or a handle rides on it, a cap holds it
//   joint()            flanged post that joins two links to each other
//   handle()           free-spinning grip that drops over a long post
//   cap()              press-fit cap for the top of a post
//   pointer()          hub ring with a thin arm that reaches past the dial knob
//   dial_knob()        the knob with a numbered disc: the pointer reads its rim
//   pulley(n)          grooved wheel for rubber bands, diameter MOD * n like a gear
//   link(n)            bar with n bearing seats at grid pitch
//   ratchet()          12 tooth sawtooth wheel on the gear hub
//   pawl(flip)         clamps on a pin two sockets away, a leaf spring tooth
//
// Every part prints flat without support. Parts with pegs (crank, pointer)
// print pegs up, which is upside down from how they sit on the gear.

include <standard.scad>
include <gear.scad>

HUB_T   = 2;                          // ring under the knob: 3 mm gap, 1 mm to spare
HUB_ID  = SPACER_OD + 1.5;            // clears the knob boss
ARM_W   = 7 * MOD;                    // 14 / 10.5
ARM_T   = LEVEL + HUB_T;              // thick part of a crank: its post starts at level + 2
R_FREE  = KNOB_D / 2 + 1.5;           // beyond this radius a part may rise above the hub ring
POST_D  = BOLT[0] - 0.1;              // a bearing's bore slides over it
STEM_D  = 3 * MOD;                    // press-fit stem of the post, 6 / 4.5
STEM_H  = ARM_T - 2;
CAP_D   = 3.2;                        // cap stem hole in the post top
DIAL_R  = SMALL ? 13 : 17;            // dial knob disc: clears a neighbour's gear one level up
DIAL_T  = 2.5;

// Hub ring with three pegs down, as the coupler half has. z = 0 is the ring bottom.
module hub_ring(t = HUB_T) {
    peg_h = PEG_DEPTH - 0.3;
    difference() {
        union() {
            cylinder(d = CPL_OD, h = t);
            for (i = [0, 2, 4]) rotate(i * 360 / PEG_N) translate([PEG_R, 0, -peg_h]) {
                cylinder(d1 = PEG_D - 0.8, d2 = PEG_D, h = 0.4, $fn = 32);
                translate([0, 0, 0.4 - EPS]) cylinder(d = PEG_D, h = peg_h - 0.4 + EPS, $fn = 32);
            }
        }
        translate([0, 0, -peg_h - 1]) cylinder(d = HUB_ID, h = t + peg_h + 2);
    }
}

// Crank: a hub ring, a thick arm beyond the knob and a socket for a post at
// `throw` from the axis. The post top then sits two levels above the gear, so
// a link on the post lines up with a link on a pin two levels up.
module crank(throw = 2 * GRID) {
    assert(throw >= R_FREE + ARM_W / 2, "throw too short for the knob");
    stem = STEM_D + fit("post_fit");
    difference() {
        union() {
            hub_ring();
            // thin arm from the hub to the thick part
            linear_extrude(HUB_T) hull() { translate([CPL_OD / 2 - ARM_W / 2, 0]) circle(d = ARM_W); translate([R_FREE + ARM_W / 2, 0]) circle(d = ARM_W); }
            // thick arm to the post socket
            linear_extrude(ARM_T) hull() { translate([R_FREE + ARM_W / 2, 0]) circle(d = ARM_W); translate([throw, 0]) circle(d = ARM_W + 2); }
        }
        translate([throw, 0, ARM_T - STEM_H]) cylinder(d = stem, h = STEM_H + EPS);
        translate([0, 0, -PEG_DEPTH]) cylinder(d = HUB_ID, h = ARM_T + PEG_DEPTH + EPS);
    }
}

// Post: press the stem into a crank. A bearing (link) or the handle rides on
// the post; the cap presses into the hole on top and keeps it there.
module post(h = GEAR_T + 3) {
    union() {
        translate([0, 0, -STEM_H]) cylinder(d = STEM_D, h = STEM_H + EPS);
        difference() {
            union() {
                cylinder(d = POST_D + 2, h = 1);                     // shoulder: the bearing sits on it
                cylinder(d = POST_D, h = h - 0.5);
                translate([0, 0, h - 0.5]) cylinder(d1 = POST_D, d2 = POST_D - 1, h = 0.5);
            }
            translate([0, 0, h - 5]) cylinder(d = CAP_D, h = 5 + EPS);
        }
    }
}

// Joint post: joins two links away from any pin. A flange underneath, a bearing
// in each link with a 3 mm spacer between, the cap on top.
module joint() {
    h = 2 * GEAR_T + SPACER_H + 2.5;
    difference() {
        union() {
            cylinder(d = POST_D + 6, h = 1.5);
            cylinder(d = POST_D + 2, h = 2.5);                       // shoulder under the first bearing
            cylinder(d = POST_D, h = h - 0.5);
            translate([0, 0, h - 0.5]) cylinder(d1 = POST_D, d2 = POST_D - 1, h = 0.5);
        }
        translate([0, 0, h - 5]) cylinder(d = CAP_D, h = 5 + EPS);
    }
}

// Handle: a grip that spins on the long post.
module handle(h = 26) {
    difference() {
        union() {
            cylinder(d = POST_D + 6, h = h);
            for (z = [4 : 4 : h - 5]) translate([0, 0, z]) cylinder(d = POST_D + 7.5, h = 1.5);
        }
        translate([0, 0, -EPS]) cylinder(d = POST_D + fit("bore_clear"), h = h + 2 * EPS);
    }
}

// Cap: a disc with a slotted stem that presses into the post top.
module cap() {
    difference() {
        union() {
            cylinder(d = POST_D + 3, h = 1.5);
            translate([0, 0, 1.5 - EPS]) cylinder(d = CAP_D + 0.2, h = 4.5);
        }
        translate([-0.4, -CAP_D, 2.5]) cube([0.8, 2 * CAP_D, 4]);
    }
}

// Pointer: hub ring and a thin arm that runs under the dial knob's disc and
// shows past its rim. Prints pegs up.
module pointer() {
    reach = DIAL_R + 4;
    w = 3 * MOD;
    difference() {
        union() {
            hub_ring();
            linear_extrude(HUB_T) hull() { translate([CPL_OD / 2 - w, 0]) circle(d = 2 * w); translate([reach, 0]) circle(d = w); }
        }
        translate([0, 0, -PEG_DEPTH]) cylinder(d = HUB_ID, h = ARM_T + PEG_DEPTH + EPS);
    }
}

// Seven-segment digit, height h, centred; d = 0..9.
module digit(d, h = 6) {
    on = [[1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
          [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1]][d];
    s = h / 2; w = h / 6;
    // segments a..g: [x, y, horizontal]
    seg = [[0, s, 1], [s / 2, s / 2, 0], [s / 2, -s / 2, 0], [0, -s, 1], [-s / 2, -s / 2, 0], [-s / 2, s / 2, 0], [0, 0, 1]];
    for (i = [0 : 6]) if (on[i] == 1) translate([seg[i][0], seg[i][1]]) square(seg[i][2] == 1 ? [s - w / 2, w] : [w, s - w / 2], center = true);
}
module number(n, h = 6) {
    digits = n >= 10 ? [floor(n / 10), n % 10] : [n];
    pitch = h * 0.7;
    for (i = [0 : len(digits) - 1]) translate([(i - (len(digits) - 1) / 2) * pitch, 0]) digit(digits[i], h);
}

// Dial knob: the bolt knob with a flat disc under the grip, clock numbers and
// ticks raised on the disc around its rim. It is fixed (it is the knob), the
// pointer turns under it, and the pointer's tip shows past the rim.
module dial_knob() {
    bore = BOLT[0] + fit("bolt_clear");
    af = BOLT[1] + fit("nut_clear");
    pocket = BOLT[2] + 0.2;
    z0 = KNOB_BOSS_H;
    difference() {
        union() {
            cylinder(d = SPACER_OD, h = z0 + EPS);
            translate([0, 0, z0]) cylinder(r = DIAL_R, h = DIAL_T);
            translate([0, 0, z0 + DIAL_T - EPS]) cylinder(d = KNOB_D, h = KNOB_H - z0 - DIAL_T + EPS);
            translate([0, 0, z0 + DIAL_T - EPS]) linear_extrude(0.6 + EPS) {
                for (k = [0 : 59]) rotate(90 - k * 6) translate([DIAL_R - (k % 5 == 0 ? 3 : 1.6), -0.3]) square([k % 5 == 0 ? 2.6 : 1.2, 0.6]);
                for (k = [0 : 11]) rotate(90 - k * 30) translate([DIAL_R - 6, 0]) rotate(-90 + k * 30) number(k == 0 ? 12 : k, 3.4);
            }
        }
        translate([0, 0, -EPS]) cylinder(d = bore, h = KNOB_H + 2 * EPS);
        translate([0, 0, KNOB_H - pocket]) cylinder(d = af / cos(30), h = pocket + EPS, $fn = 6);
        for (i = [0 : 11]) rotate(i * 30) translate([KNOB_D / 2 + 0.6, 0, z0 + DIAL_T + 1])
            cylinder(r = 1.6 * KNOB_D / 20, h = KNOB_H, $fn = 24);
    }
}

// Pulley: a flanged wheel with a round groove for a rubber band, on the gear
// hub. `n` is its size as tooth-count equivalent: diameter MOD * n, so a P40
// over a P20 is a 2:1 drive, like the gears.
module pulley(n = 40) {
    d = MOD * n + 2;
    g = 3.2;    // groove width
    difference() {
        cylinder(d = d, h = GEAR_T);
        rotate_extrude() translate([d / 2, GEAR_T / 2]) hull() { circle(d = g); translate([g, 0]) circle(d = g); }
        bearing_seat();
        translate([0, 0, GEAR_T]) peg_holes();
        mirror([0, 0, 1]) peg_holes();
        face_pattern(n, n >= 40 ? "spokes" : "solid");
    }
}

// Link: a bar with n bearing seats on the grid. One level thick, like a gear.
module link(n = 3) {
    w = BEARING[1] + 6;
    L = GRID * (n - 1);
    difference() {
        linear_extrude(GEAR_T) hull() { circle(d = w); translate([L, 0]) circle(d = w); }
        for (i = [0 : n - 1]) translate([GRID * i, 0, 0]) bearing_seat();
        // lighten between the holes
        if (GRID - BEARING[1] > 6) for (i = [0 : n - 2]) translate([GRID * i + GRID / 2, 0, -EPS]) cylinder(d = GRID - BEARING[1] - 4, h = GEAR_T + 2 * EPS);
    }
}

// Ratchet wheel: 12 sawtooth teeth, tip radius a grid step less 2.5 mm, so a
// pawl on a pin two sockets away reaches it and a 20T gear two sockets away
// on the same level still clears it. Turns freely clockwise (seen
// from above) past a pawl, locks the other way; flip the pawl for the reverse.
RATCHET_N = 12;
RATCHET_R = GRID - 2.5;
RATCHET_DEPTH = 1.6 * MOD;
module ratchet_2d() {
    r0 = RATCHET_R - RATCHET_DEPTH;
    polygon([for (i = [0 : RATCHET_N - 1]) each [
        [RATCHET_R * cos(i * 30), RATCHET_R * sin(i * 30)],
        [r0 * cos(i * 30 + 2), r0 * sin(i * 30 + 2)]]]);
}
module ratchet() {
    difference() {
        linear_extrude(GEAR_T) ratchet_2d();
        bearing_seat();
        translate([0, 0, GEAR_T]) peg_holes();
        mirror([0, 0, 1]) peg_holes();
    }
}

// Pawl: clamps on a pin (bore over the bolt, the knob boss and spacer grip it)
// two sockets from the ratchet pin, which is at +x. A rigid stub carries a
// leaf spring whose tooth rides over the ratchet teeth one way and catches
// them the other. `flip` mirrors it for the opposite direction.
module pawl(flip = false) {
    bore = BOLT[0] + fit("bolt_clear");
    hub = 9 * MOD;
    leaf_t = 0.6 * MOD;
    C = [2 * GRID, 0];
    r_leaf = RATCHET_R + leaf_t / 2 + 0.2;       // the leaf passes just outside the tooth tips
    tip = C + r_leaf * [cos(150), sin(150)];     // leaf end; the tooth hangs inward from here
    A = [0.6 * GRID, -0.6 * GRID];               // leaf root, so the leaf runs along the wheel's tangent
    depth = RATCHET_DEPTH + leaf_t / 2 - 0.4;    // tooth reach toward the root circle
    mirror(flip ? [0, 1, 0] : [0, 0, 0])
    difference() {
        linear_extrude(GEAR_T) union() {
            circle(d = hub);
            hull() { circle(d = hub * 0.6); translate(A) circle(d = 2 * leaf_t + 2); }   // rigid stub
            hull() { translate(A) circle(d = leaf_t); translate(tip) circle(d = leaf_t); }  // leaf
            // tooth at the leaf end: local -x points into the wheel, +y back along the leaf.
            // The flat face (y = -leaf_t/2) catches the steep tooth face when the wheel
            // turns counter-clockwise; the ramp lets it ride over the teeth clockwise.
            translate(tip) rotate(150) polygon([[leaf_t / 2, -leaf_t / 2], [-depth, -leaf_t / 2], [leaf_t / 2, -leaf_t / 2 + 1.3 * depth]]);
        }
        translate([0, 0, -EPS]) cylinder(d = bore, h = GEAR_T + 2 * EPS);
    }
}
