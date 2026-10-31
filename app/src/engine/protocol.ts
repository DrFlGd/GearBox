export type OutputFormat = "stl" | "obj";

export type RenderRequest =
  | { kind: "warmup"; id: number }
  | { kind: "render"; id: number; defines: string[]; format: OutputFormat };

export type WorkerMessage =
  | { type: "ready" }
  | { type: "fatal"; text: string }
  | { type: "log"; id: number; text: string }
  | { type: "done"; id: number; ok: boolean; bytes: Uint8Array | null; seconds: number; messages: string[]; exitCode: number | null; cached?: boolean };

export type RenderResult = { ok: boolean; bytes: Uint8Array | null; seconds: number; messages: string[]; log: string[]; cached?: boolean };
