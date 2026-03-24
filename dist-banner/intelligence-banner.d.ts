/**
 * GAME Component: intelligence-banner
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
 * `<game-intelligence-banner>` Web Component
 *
 * A self-contained WebGPU/WebGL2 shader component.
 *
 * @example
 * ```html
 * <game-intelligence-banner pulse="0" heat="0" burst="0"></game-intelligence-banner>
 * ```
 *
 * @example
 * ```typescript
 * const el = document.querySelector('game-intelligence-banner')!;
   * el.pulse = 0;
   * el.heat = 0;
 * ```
 */
interface GameIntelligenceBannerElement extends HTMLElement {
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
  pulse: number;
  /** Default: 0 */
  heat: number;
  /** Default: 0 */
  burst: number;
  /** Default: 0 */
  morph: number;
  /** Default: 0 */
  error_val: number;
  /** Default: 0 */
  staleness: number;
  /** Default: 0.9 */
  opacity_val: number;
  /** Default: 0 */
  signal_intensity: number;
  /** Default: 0 */
  color_shift: number;
  /** Default: 0 */
  critical_count: number;
  /** Default: 0 */
  metabolism: number;
  /** Default: 0.5 */
  cursor_x: number;
  /** Default: 0.5 */
  cursor_y: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'game-intelligence-banner': GameIntelligenceBannerElement;
  }
}

export {};
