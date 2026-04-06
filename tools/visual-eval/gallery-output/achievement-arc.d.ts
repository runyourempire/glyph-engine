/**
 * GLYPH Component: achievement-arc
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
 * `<game-achievement-arc>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-achievement-arc fill_angle="5.3" glow_val="2"></game-achievement-arc>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-achievement-arc')!;
   * el.fill_angle = 5.3;
   * el.glow_val = 2;
 * ```
 */
interface GameAchievementArcElement extends HTMLElement {
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
  /** Default: 5.3 */
  fill_angle: number;
  /** Default: 2 */
  glow_val: number;
  /** Convenience alias for fill_angle (0-1 range, mapped to radians). */
  progress: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-achievement-arc': GameAchievementArcElement;
  }
}

export {};
