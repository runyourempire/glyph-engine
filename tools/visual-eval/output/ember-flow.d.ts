/**
 * GLYPH Component: ember-flow
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
 * `<game-ember-flow>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-ember-flow heat="0" viscosity="0.28"></game-ember-flow>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-ember-flow')!;
   * el.heat = 0;
   * el.viscosity = 0.28;
 * ```
 */
interface GameEmberFlowElement extends HTMLElement {
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
  heat: number;
  /** Default: 0.28 */
  viscosity: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-ember-flow': GameEmberFlowElement;
  }
}

export {};
