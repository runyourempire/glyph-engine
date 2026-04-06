/**
 * GLYPH Component: volcanic-core
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
 * `<glyph-volcanic-core>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-volcanic-core pressure="0" heat="0.6"></glyph-volcanic-core>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-volcanic-core')!;
   * el.pressure = 0;
   * el.heat = 0.6;
 * ```
 */
interface GameVolcanicCoreElement extends HTMLElement {
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
  pressure: number;
  /** Default: 0.6 */
  heat: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-volcanic-core': GameVolcanicCoreElement;
  }
}

export {};
