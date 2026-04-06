/**
 * GLYPH Component: void-heartbeat
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
 * `<game-void-heartbeat>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-void-heartbeat alive="1"></game-void-heartbeat>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-void-heartbeat')!;
   * el.alive = 1;
 * ```
 */
interface GameVoidHeartbeatElement extends HTMLElement {
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
  /** Default: 1 */
  alive: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-void-heartbeat': GameVoidHeartbeatElement;
  }
}

export {};
