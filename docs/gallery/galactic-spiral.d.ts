/**
 * GLYPH Component: galactic-spiral
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
 * `<glyph-galactic-spiral>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-galactic-spiral spin="0.2" luminosity="0.4"></glyph-galactic-spiral>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-galactic-spiral')!;
   * el.spin = 0.2;
   * el.luminosity = 0.4;
 * ```
 */
interface GameGalacticSpiralElement extends HTMLElement {
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
  /** Default: 0.2 */
  spin: number;
  /** Default: 0.4 */
  luminosity: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-galactic-spiral': GameGalacticSpiralElement;
  }
}

export {};
