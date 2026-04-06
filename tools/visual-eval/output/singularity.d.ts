/**
 * GLYPH Component: singularity
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
 * `<game-singularity>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-singularity awakening="0" depth="0"></game-singularity>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-singularity')!;
   * el.awakening = 0;
   * el.depth = 0;
 * ```
 */
interface GameSingularityElement extends HTMLElement {
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
  awakening: number;
  /** Default: 0 */
  depth: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-singularity': GameSingularityElement;
  }
}

export {};
