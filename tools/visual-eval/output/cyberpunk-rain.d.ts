/**
 * GLYPH Component: cyberpunk-rain
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
 * `<game-cyberpunk-rain>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-cyberpunk-rain downpour="0" neon="0.5"></game-cyberpunk-rain>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-cyberpunk-rain')!;
   * el.downpour = 0;
   * el.neon = 0.5;
 * ```
 */
interface GameCyberpunkRainElement extends HTMLElement {
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
  downpour: number;
  /** Default: 0.5 */
  neon: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-cyberpunk-rain': GameCyberpunkRainElement;
  }
}

export {};
