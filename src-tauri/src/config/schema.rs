use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub serial: SerialConfig,
    pub video: VideoConfig,
    pub mouse: MouseConfig,
    pub ui: UiConfig,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SerialConfig {
    pub port: String,
    pub baud_rate: u32,
    pub auto_detect: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct VideoConfig {
    pub device_index: usize,
    pub resolution_w: u32,
    pub resolution_h: u32,
    pub fps: u32,
    pub format: String,
    #[serde(default = "default_true")]
    pub use_preset: bool,
    #[serde(default = "default_preset")]
    pub preset: String,
    #[serde(default)]
    pub use_buffering: bool,
}

fn default_true() -> bool {
    true
}

fn default_preset() -> String {
    "high".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MouseConfig {
    pub mode: String,
    pub screen_w: u32,
    pub screen_h: u32,
    pub sensitivity: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct UiConfig {
    pub window_width: u32,
    pub window_height: u32,
    pub show_fps: bool,
    pub show_status_bar: bool,
    pub theme: String,
}

impl AppConfig {
    /// Config file path
    /// macOS:   ~/Library/Application Support/LinkKVM/config.toml
    /// Windows: %APPDATA%/LinkKVM/config.toml
    /// Linux:   ~/.config/linkkvm/config.toml
    pub fn config_path() -> PathBuf {
        let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        base.join("linkkvm").join("config.toml")
    }

    pub fn load() -> Result<Self, Box<dyn std::error::Error>> {
        let path = Self::config_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let config: Self = toml::from_str(&content)?;
            Ok(config)
        } else {
            Ok(Self::default())
        }
    }

    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = toml::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            serial: SerialConfig {
                port: String::new(),
                baud_rate: 115200,
                auto_detect: true,
            },
            video: VideoConfig {
                device_index: 0,
                resolution_w: 1920,
                resolution_h: 1080,
                fps: 30,
                format: "MJPEG".to_string(),
                use_preset: true,
                preset: "high".to_string(),
                use_buffering: false,
            },
            mouse: MouseConfig {
                mode: "absolute".to_string(),
                screen_w: 1920,
                screen_h: 1080,
                sensitivity: 1.0,
            },
            ui: UiConfig {
                window_width: 1280,
                window_height: 720,
                show_fps: true,
                show_status_bar: true,
                theme: "auto".to_string(),
            },
        }
    }
}
