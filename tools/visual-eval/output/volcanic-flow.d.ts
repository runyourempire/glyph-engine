/**
 * GLYPH Component: volcanic-flow
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
 * `<game-volcanic-flow>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-volcanic-flow life="0" warmth="0"></game-volcanic-flow>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-volcanic-flow')!;
   * el.life = 0;
   * el.warmth = 0;
 * ```
 */
interface GameVolcanicFlowElement extends HTMLElement {
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
  life: number;
  /** Default: 0 */
  warmth: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-volcanic-flow': GameVolcanicFlowElement;
  }
}

export {};
