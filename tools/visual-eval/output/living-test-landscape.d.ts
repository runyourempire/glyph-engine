/**
 * GLYPH Component: living-test-landscape
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
 * `<game-living-test-landscape>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-living-test-landscape drift_x="0.04"></game-living-test-landscape>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-living-test-landscape')!;
   * el.drift_x = 0.04;
 * ```
 */
interface GameLivingTestLandscapeElement extends HTMLElement {
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
  /** Default: 0.04 */
  drift_x: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-living-test-landscape': GameLivingTestLandscapeElement;
  }
}

export {};
