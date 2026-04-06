/**
 * GLYPH Component: living-photo
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
 * `<game-living-photo>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-living-photo flow_speed="0.2" flow_strength="0.04" breath="0.03"></game-living-photo>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-living-photo')!;
   * el.flow_speed = 0.2;
   * el.flow_strength = 0.04;
 * ```
 */
interface GameLivingPhotoElement extends HTMLElement {
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
  /** Default: 0.2 */
  flow_speed: number;
  /** Default: 0.04 */
  flow_strength: number;
  /** Default: 0.03 */
  breath: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-living-photo': GameLivingPhotoElement;
  }
}

export {};
