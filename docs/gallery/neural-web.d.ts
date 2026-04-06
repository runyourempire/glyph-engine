/**
 * GLYPH Component: neural-web
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
 * `<glyph-neural-web>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-neural-web signal="0" plasticity="0.3"></glyph-neural-web>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-neural-web')!;
   * el.signal = 0;
   * el.plasticity = 0.3;
 * ```
 */
interface GameNeuralWebElement extends HTMLElement {
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
  signal: number;
  /** Default: 0.3 */
  plasticity: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-neural-web': GameNeuralWebElement;
  }
}

export {};
