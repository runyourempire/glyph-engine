/**
 * GLYPH Component: prismatic-cascade
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
 * `<glyph-prismatic-cascade>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-prismatic-cascade refraction="0" intensity="0.5"></glyph-prismatic-cascade>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-prismatic-cascade')!;
   * el.refraction = 0;
   * el.intensity = 0.5;
 * ```
 */
interface GamePrismaticCascadeElement extends HTMLElement {
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
  refraction: number;
  /** Default: 0.5 */
  intensity: number;
  /** Convenience alias for intensity. */
  health: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-prismatic-cascade': GamePrismaticCascadeElement;
  }
}

export {};
