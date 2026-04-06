/**
 * GLYPH Component: frozen-aether
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
 * `<game-frozen-aether>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-frozen-aether thaw="0" shimmer="0.3"></game-frozen-aether>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-frozen-aether')!;
   * el.thaw = 0;
   * el.shimmer = 0.3;
 * ```
 */
interface GameFrozenAetherElement extends HTMLElement {
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
  thaw: number;
  /** Default: 0.3 */
  shimmer: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-frozen-aether': GameFrozenAetherElement;
  }
}

export {};
