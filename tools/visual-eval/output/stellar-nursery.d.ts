/**
 * GLYPH Component: stellar-nursery
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
 * `<game-stellar-nursery>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-stellar-nursery formation="0" radiation="0.4"></game-stellar-nursery>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-stellar-nursery')!;
   * el.formation = 0;
   * el.radiation = 0.4;
 * ```
 */
interface GameStellarNurseryElement extends HTMLElement {
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
  formation: number;
  /** Default: 0.4 */
  radiation: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-stellar-nursery': GameStellarNurseryElement;
  }
}

export {};
