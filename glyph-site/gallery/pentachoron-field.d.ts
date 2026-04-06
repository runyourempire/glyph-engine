/**
 * GLYPH Component: pentachoron-field
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
 * `<glyph-pentachoron-field>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-pentachoron-field unfold="0" resonance="0"></glyph-pentachoron-field>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-pentachoron-field')!;
   * el.unfold = 0;
   * el.resonance = 0;
 * ```
 */
interface GamePentachoronFieldElement extends HTMLElement {
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
  unfold: number;
  /** Default: 0 */
  resonance: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-pentachoron-field': GamePentachoronFieldElement;
  }
}

export {};
