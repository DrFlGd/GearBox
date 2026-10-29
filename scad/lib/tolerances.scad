// tolerances.scad - every fit and clearance in the kit, by print profile.
//
// Pick a profile with `profile`, or pass single overrides as [["key", value], ...]
// (the web app writes custom profiles this way). The fit test coupon prints every
// one of these fits in a single small part so a new printer is dialed in once.

// `profile` and `overrides` are set by gearbox.scad (or -D on the command line).
// Without them: PETG, no overrides.
_profile = is_undef(profile) ? "PETG" : profile;
_overrides = is_undef(overrides) ? [] : overrides;

// key                   PLA     PETG    ABS     what it sets
_tol = [
    ["bearing_bore_d",   22.10,  22.15,  22.20],  // gear seat for a 608 outer race (22.00), light press
    ["bearing606_bore_d",17.10,  17.15,  17.20],  // gear seat for a 606 outer race (17.00), light press
    ["bore_clear",        0.30,   0.35,   0.35],  // added to a printed bore that slides over a bolt
    ["bolt_clear",        0.40,   0.40,   0.45],  // added to a bolt's nominal diameter for a through hole
    ["nut_clear",         0.20,   0.25,   0.30],  // added across flats of a captive nut or bolt head pocket
    ["slot_clear",        0.30,   0.35,   0.35],  // dovetail keys and coupler peg holes
    ["backlash",          0.20,   0.20,   0.25],  // gear backlash passed to BOSL2
    ["post_fit",          0.05,   0.10,   0.10],  // added to the press-fit socket for a crank post stem
];

function _profile_col() = _profile == "PLA" ? 1 : _profile == "ABS" ? 3 : 2;

function fit(key) =
    let(ov = [for (o = _overrides) if (o[0] == key) o[1]])
    len(ov) > 0 ? ov[0]
    : let(row = [for (r = _tol) if (r[0] == key) r])
      assert(len(row) == 1, str("unknown fit key: ", key))
      row[0][_profile_col()];
