/**
 * GLYPH Component: signal-waveform
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
 * `<game-signal-waveform>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-signal-waveform signal="0.6"></game-signal-waveform>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-signal-waveform')!;
   * el.signal = 0.6;
 * ```
 */
interface GameSignalWaveformElement extends HTMLElement {
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
  /** Default: 0.6 */
  signal: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-signal-waveform': GameSignalWaveformElement;
  }
}

export {};
