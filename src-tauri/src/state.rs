use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use crate::config::schema::AppConfig;
use crate::hid::serial::SerialManager;

pub struct AppState {
    pub serial: Mutex<Option<SerialManager>>,
    pub config: Mutex<AppConfig>,
    pub frame_buffer: Arc<Mutex<Vec<u8>>>,
    pub video_running: Arc<AtomicBool>,
    /// Record last mouse absolute coordinates, used for scroll events
    #[allow(dead_code)]
    pub last_mouse_pos: Mutex<(u16, u16)>,
    /// Actual video capture resolution (determined after ffmpeg starts)
    pub video_resolution: Arc<Mutex<(u32, u32)>>,
    /// Virtual cursor position in absolute mode (screen pixel coordinates)
    pub abs_cursor_pos: Mutex<(f64, f64)>,
    /// Whether zero calibration is needed in absolute mode
    pub abs_needs_home: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        let config = AppConfig::load().unwrap_or_default();
        Self {
            serial: Mutex::new(None),
            config: Mutex::new(config),
            frame_buffer: Arc::new(Mutex::new(Vec::new())),
            video_running: Arc::new(AtomicBool::new(false)),
            last_mouse_pos: Mutex::new((2048, 2048)),
            video_resolution: Arc::new(Mutex::new((1920, 1080))),
            abs_cursor_pos: Mutex::new((0.0, 0.0)),
            abs_needs_home: Mutex::new(true),
        }
    }
}
