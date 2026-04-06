/**
 * GLYPH Component: mycelium-swarm
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
 * `<glyph-mycelium-swarm>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-mycelium-swarm metabolism="0" chemotaxis="0"></glyph-mycelium-swarm>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-mycelium-swarm')!;
   * el.metabolism = 0;
   * el.chemotaxis = 0;
 * ```
 */
interface GameMyceliumSwarmElement extends HTMLElement {
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
  metabolism: number;
  /** Default: 0 */
  chemotaxis: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-mycelium-swarm': GameMyceliumSwarmElement;
  }
}

export {};
