/**
 * GLYPH Component: molten-earth
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
 * `<glyph-molten-earth>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-molten-earth heat="0" flow_speed="0.2"></glyph-molten-earth>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-molten-earth')!;
   * el.heat = 0;
   * el.flow_speed = 0.2;
 * ```
 */
interface GameMoltenEarthElement extends HTMLElement {
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
  /** Default: 0.2 */
  flow_speed: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-molten-earth': GameMoltenEarthElement;
  }
}

export {};
