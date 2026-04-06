/**
 * GLYPH Component: deep-current
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
 * `<game-deep-current>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-deep-current flow_speed="0.3" bio_glow="0"></game-deep-current>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-deep-current')!;
   * el.flow_speed = 0.3;
   * el.bio_glow = 0;
 * ```
 */
interface GameDeepCurrentElement extends HTMLElement {
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
  /** Default: 0.3 */
  flow_speed: number;
  /** Default: 0 */
  bio_glow: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-deep-current': GameDeepCurrentElement;
  }
}

export {};
