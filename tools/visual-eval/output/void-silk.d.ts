/**
 * GLYPH Component: void-silk
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
 * `<game-void-silk>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-void-silk weave="0" shimmer="0" thread_scale="8"></game-void-silk>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-void-silk')!;
   * el.weave = 0;
   * el.shimmer = 0;
 * ```
 */
interface GameVoidSilkElement extends HTMLElement {
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
  weave: number;
  /** Default: 0 */
  shimmer: number;
  /** Default: 8 */
  thread_scale: number;
  /** Default: 0.25 */
  flow_speed: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-void-silk': GameVoidSilkElement;
  }
}

export {};
