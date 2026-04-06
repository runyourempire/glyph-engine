/**
 * GLYPH Component: primordial
 * Auto-generated TypeScript definitions — do not edit.
 */

/** Audio data for reactive components. */
interface GameAudioData {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  beat: number;
}

/** Audio bridge for subscribable audio sources. */
interface GameAudioBridge {
  subscribe(callback: (data: GameAudioData) => void): void;
}

/**
 * `<glyph-primordial>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-primordial ignition="0" expansion="0" consciousness="0"></glyph-primordial>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-primordial')!;
   * el.ignition = 0;
   * el.expansion = 0;
 * ```
 */
interface GamePrimordialElement extends HTMLElement {
  /** Set a uniform parameter by name. */
  setParam(name: string, value: number): void;

  /** Feed audio frequency data for reactive components. */
  setAudioData(data: GameAudioData): void;

  /** Connect an audio bridge for automatic audio feeding. */
  setAudioSource(bridge: GameAudioBridge): void;

  /** Capture the current frame as ImageData. */
  getFrame(): ImageData | null;

  /** Capture the current frame as a data URL (PNG). */
  getFrameDataURL(type?: string): string | null;

  // Uniform properties
  /** Default: 0 */
  ignition: number;
  /** Default: 0 */
  expansion: number;
  /** Default: 0 */
  consciousness: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-primordial': GamePrimordialElement;
  }
}

export {};
