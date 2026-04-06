/**
 * GLYPH Component: midnight-ocean
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
 * `<game-midnight-ocean>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-midnight-ocean flow_speed="0.3" flow_strength="0.28" bio_intensity="0"></game-midnight-ocean>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-midnight-ocean')!;
   * el.flow_speed = 0.3;
   * el.flow_strength = 0.28;
 * ```
 */
interface GameMidnightOceanElement extends HTMLElement {
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
  /** Default: 0.28 */
  flow_strength: number;
  /** Default: 0 */
  bio_intensity: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-midnight-ocean': GameMidnightOceanElement;
  }
}

export {};
