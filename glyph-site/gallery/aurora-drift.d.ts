/**
 * GLYPH Component: aurora-drift
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
 * `<glyph-aurora-drift>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-aurora-drift solar_wind="0" curtain_wave="0" altitude="5"></glyph-aurora-drift>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-aurora-drift')!;
   * el.solar_wind = 0;
   * el.curtain_wave = 0;
 * ```
 */
interface GameAuroraDriftElement extends HTMLElement {
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
  solar_wind: number;
  /** Default: 0 */
  curtain_wave: number;
  /** Default: 5 */
  altitude: number;
  /** Default: 0.5 */
  color_temp: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-aurora-drift': GameAuroraDriftElement;
  }
}

export {};
