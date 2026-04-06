/**
 * GLYPH Component: aurora-borealis
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
 * `<glyph-aurora-borealis>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-aurora-borealis activity="0.5" curtain="0"></glyph-aurora-borealis>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-aurora-borealis')!;
   * el.activity = 0.5;
   * el.curtain = 0;
 * ```
 */
interface GameAuroraBorealisElement extends HTMLElement {
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
  /** Default: 0.5 */
  activity: number;
  /** Default: 0 */
  curtain: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-aurora-borealis': GameAuroraBorealisElement;
  }
}

export {};
