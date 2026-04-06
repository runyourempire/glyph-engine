/**
 * GLYPH Component: quantum-flux
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
 * `<glyph-quantum-flux>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <glyph-quantum-flux coherence="0" entanglement="0.3"></glyph-quantum-flux>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('glyph-quantum-flux')!;
   * el.coherence = 0;
   * el.entanglement = 0.3;
 * ```
 */
interface GameQuantumFluxElement extends HTMLElement {
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
  coherence: number;
  /** Default: 0.3 */
  entanglement: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'glyph-quantum-flux': GameQuantumFluxElement;
  }
}

export {};
