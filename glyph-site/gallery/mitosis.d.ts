/**
 * GLYPH Component: mitosis
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
 * `<glyph-mitosis>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-mitosis color_r="1.5" color_g="0.15" color_b="0.15"></glyph-mitosis>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-mitosis')!;
   * el.color_r = 1.5;
   * el.color_g = 0.15;
 * ```
 */
interface GameMitosisElement extends HTMLElement {
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
  /** Default: 1.5 */
  color_r: number;
  /** Default: 0.15 */
  color_g: number;
  /** Default: 0.15 */
  color_b: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-mitosis': GameMitosisElement;
  }
}

export {};
