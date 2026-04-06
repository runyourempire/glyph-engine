/**
 * GLYPH Component: bioluminescent-abyss
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
 * `<game-bioluminescent-abyss>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-bioluminescent-abyss depth="0.5" pulse="0"></game-bioluminescent-abyss>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-bioluminescent-abyss')!;
   * el.depth = 0.5;
   * el.pulse = 0;
 * ```
 */
interface GameBioluminescentAbyssElement extends HTMLElement {
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
  /** Default: 0.5 */
  depth: number;
  /** Default: 0 */
  pulse: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-bioluminescent-abyss': GameBioluminescentAbyssElement;
  }
}

export {};
