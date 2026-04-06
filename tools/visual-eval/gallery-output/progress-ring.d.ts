/**
 * GLYPH Component: progress-ring
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
 * `<game-progress-ring>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-progress-ring fill_angle="4"></game-progress-ring>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-progress-ring')!;
   * el.fill_angle = 4;
 * ```
 */
interface GameProgressRingElement extends HTMLElement {
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
  /** Default: 4 */
  fill_angle: number;
  /** Convenience alias for fill_angle (0-1 range, mapped to radians). */
  progress: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-progress-ring': GameProgressRingElement;
  }
}

export {};
