// spline.scad - the 12 pocket castellated coupling cut into every gear face.
// Cranks, couplers, pointers and cams carry the matching teeth.

include <standard.scad>

// A ring sector from r1 to r2 spanning `a` degrees, h tall, starting on +X.
module sector(r1, r2, a, h) {
    rotate_extrude(angle = a) translate([r1, 0]) square([r2 - r1, h]);
}

// Pockets to subtract from a face. z = 0 is the face, pockets go down to -depth.
module spline_pockets(depth = SPLINE_DEPTH) {
    step = 360 / SPLINE_N;
    translate([0, 0, -depth - EPS])
        for (i = [0 : SPLINE_N - 1])
            rotate(i * step) sector(SPLINE_RI, SPLINE_RO, step / 2, depth + 2 * EPS);
}

// Teeth to add to a part. They stand on z = 0 and reach up to `height`.
module spline_teeth(height = SPLINE_DEPTH - 0.4) {
    step = 360 / SPLINE_N;
    c = fit("slot_clear");
    da = c / ((SPLINE_RI + SPLINE_RO) / 2) * 180 / PI; // angular clearance, degrees
    for (i = [0 : SPLINE_N - 1])
        rotate(i * step + da / 2)
            sector(SPLINE_RI + c / 2, SPLINE_RO - c / 2, step / 2 - da, height);
}
