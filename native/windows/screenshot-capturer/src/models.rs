use serde::Serialize;
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct DisplayBounds {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: i32,
    pub(crate) height: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct CaptureTarget {
    pub(crate) display_id: i64,
    pub(crate) display_bounds: DisplayBounds,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum OutputFormat {
    Jpeg,
    Png,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DaemonConfig {
    pub(crate) output_dir: PathBuf,
    pub(crate) interval_ms: u64,
    pub(crate) max_dimension: Option<u32>,
    pub(crate) format: OutputFormat,
    pub(crate) quality: u8,
    pub(crate) initial_target: Option<CaptureTarget>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SharedState {
    pub(crate) interval_ms: u64,
    pub(crate) target: CaptureTarget,
}

#[derive(Serialize)]
pub(crate) struct FrameEvent {
    pub(crate) filepath: String,
    pub(crate) timestamp: u64,
    pub(crate) width: u32,
    pub(crate) height: u32,
    #[serde(rename = "displayId")]
    pub(crate) display_id: i64,
}
