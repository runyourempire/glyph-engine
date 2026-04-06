/**
 * GLYPH Component: digital-consciousness
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
 * `<glyph-digital-consciousness>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-digital-consciousness awareness="0" processing="0.5"></glyph-digital-consciousness>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-digital-consciousness')!;
   * el.awareness = 0;
   * el.processing = 0.5;
 * ```
 */
interface GameDigitalConsciousnessElement extends HTMLElement {
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
  awareness: number;
  /** Default: 0.5 */
  processing: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-digital-consciousness': GameDigitalConsciousnessElement;
  }
}

export {};
