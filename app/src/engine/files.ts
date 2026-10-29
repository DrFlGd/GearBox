// Every .scad file the engine needs, embedded at build time so the app is a
// single static site: the kit library under scad/ and the parts of BOSL2 that
// std.scad and gears.scad pull in (34 of its files).
const kit = import.meta.glob("../../../scad/**/*.scad", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const bosl2 = import.meta.glob(
  "../../../lib/BOSL2/{affine,attachments,beziers,builtins,color,comparisons,constants,coords,distributors,drawing,gears,geometry,linalg,lists,masks,math,miscellaneous,partitions,paths,regions,rounding,shapes2d,shapes3d,skin,std,strings,structs,threading,transforms,trigonometry,utility,vectors,version,vnf}.scad",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

export const WORK_DIR = "/work";
export const LIB_DIR = "/home/web_user/.local/share/OpenSCAD/libraries";

/** Virtual path -> file contents for the engine's file system. */
export const files: Record<string, string> = {};
for (const [k, v] of Object.entries(kit)) files[WORK_DIR + "/" + k.replace(/^.*\/scad\//, "")] = v;
for (const [k, v] of Object.entries(bosl2)) files[LIB_DIR + "/BOSL2/" + k.replace(/^.*\//, "")] = v;

