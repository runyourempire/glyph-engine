/**
 * GLYPH Component: living-coral
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
 * `<glyph-living-coral>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-living-coral current="0" bloom_cycle="0.4"></glyph-living-coral>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-living-coral')!;
   * el.current = 0;
   * el.bloom_cycle = 0.4;
 * ```
 */
interface GameLivingCoralElement extends HTMLElement {
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
  current: number;
  /** Default: 0.4 */
  bloom_cycle: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-living-coral': GameLivingCoralElement;
  }
}

export {};
