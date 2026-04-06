/**
 * GLYPH Component: tidal-forces
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
 * `<glyph-tidal-forces>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-tidal-forces pull="0" swell="0.3"></glyph-tidal-forces>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-tidal-forces')!;
   * el.pull = 0;
   * el.swell = 0.3;
 * ```
 */
interface GameTidalForcesElement extends HTMLElement {
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
  pull: number;
  /** Default: 0.3 */
  swell: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-tidal-forces': GameTidalForcesElement;
  }
}

export {};
