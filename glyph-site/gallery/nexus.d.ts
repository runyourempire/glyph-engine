/**
 * GLYPH Component: nexus
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
 * `<glyph-nexus>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-nexus activity="0" coherence="0"></glyph-nexus>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-nexus')!;
   * el.activity = 0;
   * el.coherence = 0;
 * ```
 */
interface GameNexusElement extends HTMLElement {
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
  activity: number;
  /** Default: 0 */
  coherence: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-nexus': GameNexusElement;
  }
}

export {};
