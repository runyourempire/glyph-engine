/* tslint:disable */
/* eslint-disable */

/**
 * Compile GAME source to a Web Component JS string.
 *
 * # Arguments
 * * `source` - GAME DSL source code
 * * `target` - "webgpu", "webgl2", or "both"
 *
 * # Returns
 * JSON string with `[{ name, js, wgsl?, glsl?, html? }]` or error message
 */
export function compileGame(source: string, target: string): string;

/**
 * Get all available builtin function signatures as JSON.
 */
export function getBuiltins(): string;

/**
 * Get available named palette names as JSON array.
 */
export function getPaletteNames(): string;

/**
 * Validate GAME source without generating output.
 *
 * Returns "ok" or an error description.
 */
export function validateGame(source: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compileGame: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly getBuiltins: () => [number, number];
    readonly getPaletteNames: () => [number, number];
    readonly validateGame: (a: number, b: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
