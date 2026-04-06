/**
 * GLYPH Component: labyrinth
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
 * `<game-labyrinth>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-labyrinth color_r="1.2" color_g="1.2" color_b="1.4"></game-labyrinth>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-labyrinth')!;
   * el.color_r = 1.2;
   * el.color_g = 1.2;
 * ```
 */
interface GameLabyrinthElement extends HTMLElement {
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
  /** Default: 1.2 */
  color_r: number;
  /** Default: 1.2 */
  color_g: number;
  /** Default: 1.4 */
  color_b: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-labyrinth': GameLabyrinthElement;
  }
}

export {};
