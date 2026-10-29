// Source of scad/lib/tolerances.scad, for the profile editor. Imported on its
// own so the UI bundle does not carry the whole BOSL2 library (the worker does).
import src from "../../../scad/lib/tolerances.scad?raw";
export const tolerancesSource: string = src;
