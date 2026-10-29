// tolerances.scad - every fit and clearance in the kit, by print profile.
//
// Pick a profile with `profile`, or pass single overrides as [["key", value], ...]
// (the web app writes custom profiles this way). The fit test coupon prints every
// one of these fits in a single small part so a new printer is dialed in once.

profile = "PETG"; // [PLA, PETG, ABS]
overrides = [];   // e.g. [["axle_d", 7.95], ["bearing_bore_d", 22.2]]

// key                   PLA     PETG    ABS     what it sets
_tol = [
    ["axle_d",            7.90,   7.85,   7.90],  // printed pin axle that slides through a 608 bore (8.00)
    ["bearing_bore_d",   22.10,  22.15,  22.20],  // gear seat for a 608 outer race (22.00), light press
    ["bearing626_bore_d",19.10,  19.15,  19.20],  // gear seat for a 626 outer race (19.00)
    ["hole_clear",        0.30,   0.35,   0.40],  // added to a hole a printed boss slides into
    ["bore_clear",        0.30,   0.35,   0.35],  // added to a printed bore that slides over an 8 mm axle or bolt
    ["bolt_clear",        0.40,   0.40,   0.45],  // added to a bolt's nominal diameter for a through hole
    ["nut_clear",         0.20,   0.25,   0.30],  // added across flats of a captive nut pocket
    ["slot_clear",        0.30,   0.35,   0.35],  // double-D slot, dovetail keys and spline pockets
    ["lug_clear",         0.15,   0.20,   0.20],  // vertical play of bayonet lugs under the plate
    ["backlash",          0.20,   0.20,   0.25],  // gear backlash passed to BOSL2
];

function _profile_col() = profile == "PLA" ? 1 : profile == "ABS" ? 3 : 2;

function fit(key) =
    let(ov = [for (o = overrides) if (o[0] == key) o[1]])
    len(ov) > 0 ? ov[0]
    : let(row = [for (r = _tol) if (r[0] == key) r])
      assert(len(row) == 1, str("unknown fit key: ", key))
      row[0][_profile_col()];
