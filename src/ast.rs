/// Root of a GAME program.
#[derive(Debug, Clone)]
pub struct Program {
    pub imports: Vec<Import>,
    pub cinematics: Vec<Cinematic>,
    pub breeds: Vec<BreedBlock>,
    pub projects: Vec<ProjectBlock>,
}

/// `import "path" as alias`
#[derive(Debug, Clone)]
pub struct Import {
    pub path: String,
    pub alias: String,
}

/// `cinematic "name" { layers, arcs, resonates, listen, voice, score, gravity, react, swarm, flow }`
#[derive(Debug, Clone)]
pub struct Cinematic {
    pub name: String,
    pub layers: Vec<Layer>,
    pub arcs: Vec<ArcBlock>,
    pub resonates: Vec<ResonateBlock>,
    pub listen: Option<ListenBlock>,
    pub voice: Option<VoiceBlock>,
    pub score: Option<ScoreBlock>,
    pub gravity: Option<GravityBlock>,
    pub react: Option<ReactBlock>,
    pub swarm: Option<SwarmBlock>,
    pub flow: Option<FlowBlock>,
}

/// `layer ident [(opts)] [memory: f] [cast kind] { body }`
#[derive(Debug, Clone)]
pub struct Layer {
    pub name: String,
    pub opts: Vec<Param>,
    pub memory: Option<f64>,
    pub cast: Option<String>,
    pub body: LayerBody,
}

/// A layer body is either a list of named params or a stage pipeline.
#[derive(Debug, Clone)]
pub enum LayerBody {
    Params(Vec<Param>),
    Pipeline(Vec<Stage>),
}

/// `name: value [~ modulation] [temporal_ops]*`
#[derive(Debug, Clone)]
pub struct Param {
    pub name: String,
    pub value: Expr,
    pub modulation: Option<Expr>,
    pub temporal_ops: Vec<TemporalOp>,
}

/// Temporal operator applied to a parameter value.
#[derive(Debug, Clone)]
pub enum TemporalOp {
    /// `>> duration` — delay via ring buffer
    Delay(Duration),
    /// `<> duration` — exponential moving average smoothing
    Smooth(Duration),
    /// `!! duration` — edge-detect trigger with decay envelope
    Trigger(Duration),
    /// `.. [min, max]` — range clamp
    Range(Expr, Expr),
}

/// A single stage in a pipeline: `name(args)`
#[derive(Debug, Clone)]
pub struct Stage {
    pub name: String,
    pub args: Vec<Arg>,
}

/// An argument — optionally named.
#[derive(Debug, Clone)]
pub struct Arg {
    pub name: Option<String>,
    pub value: Expr,
}

/// `arc { entries }`
#[derive(Debug, Clone)]
pub struct ArcBlock {
    pub entries: Vec<ArcEntry>,
}

/// `target: from -> to over duration [easing]`
#[derive(Debug, Clone)]
pub struct ArcEntry {
    pub target: String,
    pub from: Expr,
    pub to: Expr,
    pub duration: Duration,
    pub easing: Option<String>,
}

/// `resonate { entries }`
#[derive(Debug, Clone)]
pub struct ResonateBlock {
    pub entries: Vec<ResonateEntry>,
}

/// `source -> target.field * weight`
#[derive(Debug, Clone)]
pub struct ResonateEntry {
    pub source: String,
    pub target: String,
    pub field: String,
    pub weight: Expr,
}

/// Time durations supported by the language.
#[derive(Debug, Clone, PartialEq)]
pub enum Duration {
    Seconds(f64),
    Millis(f64),
    Bars(i64),
}

/// Binary operators.
#[derive(Debug, Clone, PartialEq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
}

/// Expression tree.
#[derive(Debug, Clone)]
pub enum Expr {
    Number(f64),
    String(String),
    Ident(String),
    DottedIdent {
        object: String,
        field: String,
    },
    Array(Vec<Expr>),
    Paren(Box<Expr>),
    Neg(Box<Expr>),
    BinOp {
        op: BinOp,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    Call {
        name: String,
        args: Vec<Arg>,
    },
    Duration(Duration),
}

// ── Phase 3: Audio blocks ────────────────────────────────

/// `listen { signal_name: algorithm(params) ... }`
#[derive(Debug, Clone)]
pub struct ListenBlock {
    pub signals: Vec<ListenSignal>,
}

/// A named audio signal with its DSP algorithm.
#[derive(Debug, Clone)]
pub struct ListenSignal {
    pub name: String,
    pub algorithm: String,
    pub params: Vec<Param>,
}

/// `voice { oscillators, filters, output chain }`
#[derive(Debug, Clone)]
pub struct VoiceBlock {
    pub nodes: Vec<VoiceNode>,
}

/// A node in the voice synthesis graph.
#[derive(Debug, Clone)]
pub struct VoiceNode {
    pub name: String,
    pub kind: String,
    pub params: Vec<Param>,
}

// ── Phase 4: Composition blocks ──────────────────────────

/// `score tempo(BPM) { motifs, phrases, sections, arrange }`
#[derive(Debug, Clone)]
pub struct ScoreBlock {
    pub tempo_bpm: f64,
    pub motifs: Vec<Motif>,
    pub phrases: Vec<Phrase>,
    pub sections: Vec<Section>,
    pub arrange: Vec<String>,
}

/// `motif name { target: from -> to over duration }`
#[derive(Debug, Clone)]
pub struct Motif {
    pub name: String,
    pub entries: Vec<ArcEntry>,
}

/// `phrase name = motif1 | motif2 | ...`
#[derive(Debug, Clone)]
pub struct Phrase {
    pub name: String,
    pub motifs: Vec<String>,
}

/// `section name = phrase1 phrase2 ...`
#[derive(Debug, Clone)]
pub struct Section {
    pub name: String,
    pub phrases: Vec<String>,
}

// ── Phase 4B: Breed ──────────────────────────────────────

/// `breed "name" from "parent1" + "parent2" { rules }`
#[derive(Debug, Clone)]
pub struct BreedBlock {
    pub name: String,
    pub parents: Vec<String>,
    pub inherit_rules: Vec<InheritRule>,
    pub mutations: Vec<Mutation>,
}

/// `inherit layers|params: mix(weight)`
#[derive(Debug, Clone)]
pub struct InheritRule {
    pub target: String,
    pub strategy: String,
    pub weight: f64,
}

/// `mutate param: +/-range`
#[derive(Debug, Clone)]
pub struct Mutation {
    pub target: String,
    pub range: f64,
}

// ── Phase 5: Physics + Spatial ───────────────────────────

/// `gravity { rule, damping, bounds }`
#[derive(Debug, Clone)]
pub struct GravityBlock {
    pub force_law: Expr,
    pub damping: f64,
    pub bounds: BoundsMode,
}

/// How particles interact with boundaries.
#[derive(Debug, Clone, PartialEq)]
pub enum BoundsMode {
    Reflect,
    Wrap,
    None,
}

/// `project mode(params) { source, warp }`
#[derive(Debug, Clone)]
pub struct ProjectBlock {
    pub mode: ProjectMode,
    pub source: String,
    pub params: Vec<Param>,
}

/// Projection target surface type.
#[derive(Debug, Clone, PartialEq)]
pub enum ProjectMode {
    Flat,
    Dome,
    Cube,
    Led,
}

// ── Phase 6: Emergent Systems ────────────────────────────

/// `react { feed, kill, diffuse_a, diffuse_b, seed }`
/// Gray-Scott reaction-diffusion on ping-pong textures.
#[derive(Debug, Clone)]
pub struct ReactBlock {
    pub feed: f64,
    pub kill: f64,
    pub diffuse_a: f64,
    pub diffuse_b: f64,
    pub seed: SeedMode,
}

/// Initial perturbation for reaction-diffusion.
#[derive(Debug, Clone, PartialEq)]
pub enum SeedMode {
    /// Centered blob of chemical B
    Center(f64),
    /// Random scattered points
    Scatter(u32),
    /// Uniform random field
    Random(f64),
}

/// `swarm { agents, sensor_angle, sensor_dist, turn_angle, step, deposit, decay, bounds }`
/// Physarum polycephalum stigmergic agent simulation.
#[derive(Debug, Clone)]
pub struct SwarmBlock {
    pub agents: u32,
    pub sensor_angle: f64,
    pub sensor_dist: f64,
    pub turn_angle: f64,
    pub step_size: f64,
    pub deposit: f64,
    pub decay: f64,
    pub diffuse: u32,
    pub bounds: BoundsMode,
}

/// `flow { type, scale, speed, octaves, strength, bounds }`
/// Curl noise vector field for particle advection.
#[derive(Debug, Clone)]
pub struct FlowBlock {
    pub flow_type: FlowType,
    pub scale: f64,
    pub speed: f64,
    pub octaves: u32,
    pub strength: f64,
    pub bounds: BoundsMode,
}

/// Vector field generation algorithm.
#[derive(Debug, Clone, PartialEq)]
pub enum FlowType {
    Curl,
    Perlin,
    Simplex,
    Vortex,
}
