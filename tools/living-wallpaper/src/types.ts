/** Animation behavior for a region */
export type AnimationClass = 'static' | 'water' | 'sky' | 'vegetation' | 'fire' | 'smoke';

/** Scene type for template selection */
export type SceneType =
  | 'aurora'
  | 'ocean_coast'
  | 'waterfall'
  | 'forest_stream'
  | 'campfire'
  | 'thunderstorm'
  | 'city_night'
  | 'desert_dunes'
  | 'sunset_landscape'
  | 'mountain_lake'
  | 'generic';

/** Motion type detected from video analysis */
export type MotionType = 'directional_flow' | 'oscillating' | 'turbulent' | 'pulsing' | 'static';

/** A region identified by Claude Vision with animation parameters */
export interface RegionRecipe {
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  depth_hint: number;
  animation_class: AnimationClass;
  flow_direction: [number, number];
  flow_speed: number;
  warp_amount: number;
  distort_frequency: number;
}

/** Full image analysis result from Claude Vision */
export interface ImageRecipe {
  scene_type: string;
  regions: RegionRecipe[];
  global_wind_direction: [number, number];
  ambient_motion_intensity: number;
  /** Normalized UV position of brightest light source */
  sun_position?: [number, number];
  /** Dominant color temperature */
  color_temp?: 'warm' | 'cool' | 'neutral';
  /** Time of day classification */
  time_of_day?: 'dawn' | 'day' | 'golden_hour' | 'dusk' | 'night';
  /** Whether visible water surface is present */
  has_water?: boolean;
  /** Whether visible sky is present */
  has_sky?: boolean;
}

/** Video-derived motion data for a single region */
export interface VideoRegionMotion {
  name: string;
  animation_class: AnimationClass;
  motion_type: MotionType;
  /** Mean flow direction as unit vector */
  flow_direction: [number, number];
  /** Mean flow speed (0-1 normalized) */
  flow_speed: number;
  /** Flow magnitude standard deviation — turbulence indicator */
  flow_turbulence: number;
  /** Dominant oscillation frequency in Hz (from FFT) */
  dominant_freq_hz: number;
  /** Angular frequency for sin(time * this) */
  game_angular_freq: number;
  /** Oscillation amplitude (from FFT) */
  oscillation_amplitude: number;
  /** FBM persistence derived from multi-scale energy analysis */
  derived_fbm_persistence: number;
  /** FBM octave count derived from energy spectrum */
  derived_fbm_octaves: number;
  /** Distort strength derived from flow std deviation */
  derived_distort_strength: number;
  /** Mean color of this region (RGB 0-1) */
  mean_color: [number, number, number];
  /** Color variation over time (for tint layers) */
  color_shift_amplitude: number;
}

/** Full video analysis result — replaces ImageRecipe for video input */
export interface VideoMotionDescriptor {
  /** Classified scene type for template selection */
  scene_type: SceneType;
  /** LLM description of the scene's motion character */
  scene_characteristic: string;
  /** Per-region motion analysis */
  regions: VideoRegionMotion[];
  /** Global wind direction derived from camera-stabilized flow */
  global_wind_direction: [number, number];
  /** Overall motion intensity (0-1) */
  ambient_motion_intensity: number;
  /** Source video metadata */
  video_fps: number;
  video_duration_sec: number;
  analysis_resolution: [number, number];
  /** Whether camera motion was detected and removed */
  camera_stabilized: boolean;
  /** Camera motion magnitude (before removal) */
  camera_motion_magnitude: number;
  /** Sun/light source position */
  sun_position?: [number, number];
  /** Color temperature classification */
  color_temp?: 'warm' | 'cool' | 'neutral';
  /** Time of day classification */
  time_of_day?: 'dawn' | 'day' | 'golden_hour' | 'dusk' | 'night';
  /** Whether visible water surface is present */
  has_water?: boolean;
  /** Whether visible sky is present */
  has_sky?: boolean;
  /** Whether visible fire/flame is present */
  has_fire?: boolean;
  /** Whether visible vegetation is present */
  has_vegetation?: boolean;
}

/** Pipeline output: all generated assets */
export interface PipelineOutput {
  depthMap: Buffer;
  flowMap: Buffer;
  masks: Map<string, Buffer>;
  glyphSource: string;
  recipe: ImageRecipe;
  width: number;
  height: number;
}

/** Video pipeline output: all generated assets from video analysis */
export interface VideoPipelineOutput {
  /** Representative still frame from video */
  stillFrame: Buffer;
  depthMap: Buffer;
  flowMap: Buffer;
  /** Motion magnitude texture (per-pixel flow std dev) */
  motionMap: Buffer;
  /** Dominant frequency texture (per-pixel FFT peak) */
  freqMap?: Buffer;
  masks: Map<string, Buffer>;
  glyphSource: string;
  descriptor: VideoMotionDescriptor;
  width: number;
  height: number;
}
