/**
 * GLYPH Component: void-engine
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
 * `<game-void-engine>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-void-engine pulse="0" awareness="0.3" depth="0.5"></game-void-engine>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-void-engine')!;
   * el.pulse = 0;
   * el.awareness = 0.3;
 * ```
 */
interface GameVoidEngineElement extends HTMLElement {
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
  pulse: number;
  /** Default: 0.3 */
  awareness: number;
  /** Default: 0.5 */
  depth: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-void-engine': GameVoidEngineElement;
  }
}

export {};
