/**
 * GLYPH Component: dismiss-fade
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
 * `<game-dismiss-fade>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-dismiss-fade fade="1"></game-dismiss-fade>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-dismiss-fade')!;
   * el.fade = 1;
 * ```
 */
interface GameDismissFadeElement extends HTMLElement {
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
  fade: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-dismiss-fade': GameDismissFadeElement;
  }
}

export {};
