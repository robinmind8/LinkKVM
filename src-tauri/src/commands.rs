use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::State;

use crate::config::schema::AppConfig;
use crate::hid::ch9329::{Ch9329, Ch9329Config};
use crate::hid::serial::{PortInfo, SerialManager};
use crate::state::AppState;
use crate::video::capture::VideoCapture;
use crate::video::stream;

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    pub index: usize,
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct StatusInfo {
    pub connected: bool,
    pub detail: String,
}

// --- Permission Commands ---

#[derive(Serialize, Clone)]
pub struct PermissionStatus {
    pub camera: String,
}

#[tauri::command]
pub fn check_permissions() -> Result<PermissionStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let camera = check_camera_status_macos();
        Ok(PermissionStatus { camera })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(PermissionStatus {
            camera: "authorized".to_string(),
        })
    }
}

#[cfg(target_os = "macos")]
fn check_camera_status_macos() -> String {
    // Use swift to check AVCaptureDevice authorization status
    let result = std::process::Command::new("swift")
        .args([
            "-e",
            "import AVFoundation; print(AVCaptureDevice.authorizationStatus(for: .video).rawValue)",
        ])
        .output();

    match result {
        Ok(output) => {
            let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
            match raw.as_str() {
                "0" => "notDetermined".to_string(),
                "1" => "restricted".to_string(),
                "2" => "denied".to_string(),
                "3" => "authorized".to_string(),
                _ => "unknown".to_string(),
            }
        }
        Err(_) => "unknown".to_string(),
    }
}

#[tauri::command]
pub fn request_camera_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let result = std::process::Command::new("swift")
            .args(["-e", r#"import AVFoundation; import Foundation; let s = DispatchSemaphore(value: 0); var g = false; AVCaptureDevice.requestAccess(for: .video) { r in g = r; s.signal() }; s.wait(); print(g)"#])
            .output()
            .map_err(|e| format!("Failed to request permission: {}", e))?;
        let granted = String::from_utf8_lossy(&result.stdout).trim() == "true";
        Ok(granted)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[tauri::command]
pub fn open_privacy_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")
            .spawn()
            .map_err(|e| format!("Failed to open settings: {}", e))?;
    }
    Ok(())
}

// --- Serial Commands ---

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<PortInfo>, String> {
    SerialManager::list_ports().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn connect_serial(
    state: State<'_, AppState>,
    port: String,
    baud_rate: u32,
) -> Result<String, String> {
    // Try primary baud rate, then fallback baud rate (CH9329 factory default is 9600)
    let baud_rates = if baud_rate == 9600 {
        vec![9600u32, 115200]
    } else {
        vec![baud_rate, 9600]
    };

    let mut last_error = String::new();
    for &try_baud in &baud_rates {
        match SerialManager::open(&port, try_baud) {
            Ok(mut manager) => {
                let probe_result = match manager.probe_ch9329() {
                    Ok(msg) => {
                        tracing::info!("CH9329 probe at {} baud: {}", try_baud, msg);
                        if try_baud != baud_rate {
                            format!(
                                "CH9329 found at {}baud (tried {}): {}",
                                try_baud, baud_rate, msg
                            )
                        } else {
                            msg
                        }
                    }
                    Err(e) => {
                        // Probe failed, try next baud rate
                        if try_baud != *baud_rates.last().unwrap() {
                            tracing::info!("CH9329 not found at {} baud, trying next...", try_baud);
                            last_error = e.to_string();
                            continue;
                        }
                        let msg = format!("CH9329 probe failed (data may still work): {}", e);
                        tracing::warn!("{}", msg);
                        msg
                    }
                };

                let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
                *serial = Some(manager);
                drop(serial);

                let mut config = state.config.lock().map_err(|e| e.to_string())?;
                config.serial.port = port;
                config.serial.baud_rate = try_baud;

                tracing::info!("Serial connected at {} baud", try_baud);
                return Ok(probe_result);
            }
            Err(e) => {
                tracing::warn!("Serial open at {} baud failed: {}", try_baud, e);
                last_error = e.to_string();
            }
        }
    }

    Err(format!("All baud rates failed: {}", last_error))
}

#[tauri::command]
pub fn disconnect_serial(state: State<'_, AppState>) -> Result<(), String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    *serial = None;
    tracing::info!("Serial disconnected");
    Ok(())
}

#[tauri::command]
pub fn test_serial_connection(state: State<'_, AppState>) -> Result<String, String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;
    mgr.probe_ch9329().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_serial_status(state: State<'_, AppState>) -> Result<StatusInfo, String> {
    let serial = state.serial.lock().map_err(|e| e.to_string())?;
    match &*serial {
        Some(mgr) => Ok(StatusInfo {
            connected: true,
            detail: format!("{} @ {}bps", mgr.port_name(), mgr.baud_rate()),
        }),
        None => Ok(StatusInfo {
            connected: false,
            detail: "Not connected".to_string(),
        }),
    }
}

// --- HID Commands ---

/// Send keyboard state (multiple keys pressed simultaneously)
/// keycodes: all currently pressed keycodes (up to 6)
#[tauri::command]
pub fn send_key(state: State<'_, AppState>, modifier: u8, keycodes: Vec<u8>) -> Result<(), String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;
    let packet = Ch9329::build_keyboard_packet(modifier, &keycodes);
    mgr.write(&packet).map_err(|e| e.to_string())
}

/// Release all keys
#[tauri::command]
pub fn release_keys(state: State<'_, AppState>) -> Result<(), String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;
    let packet = Ch9329::build_keyboard_packet(0, &[]);
    mgr.write(&packet).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn send_mouse_move(
    state: State<'_, AppState>,
    x: f64,
    y: f64,
    buttons: u8,
) -> Result<(), String> {
    // x, y are always relative deltas (frontend sends movementX/Y in both modes)
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;
    let dx = x.round().clamp(-127.0, 127.0) as i8;
    let dy = y.round().clamp(-127.0, 127.0) as i8;
    let packet = Ch9329::build_mouse_rel_packet(dx, dy, buttons, 0);
    mgr.write(&packet).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn send_mouse_click(
    state: State<'_, AppState>,
    x: f64,
    y: f64,
    buttons: u8,
) -> Result<(), String> {
    send_mouse_move(state, x, y, buttons)
}

#[tauri::command]
pub fn send_mouse_scroll(state: State<'_, AppState>, delta: i8) -> Result<(), String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;
    let packet = Ch9329::build_mouse_rel_packet(0, 0, 0, delta);
    mgr.write(&packet).map_err(|e| e.to_string())
}

// --- Video Commands ---

#[tauri::command]
pub fn list_video_devices() -> Result<Vec<DeviceInfo>, String> {
    VideoCapture::list_devices().map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
pub struct VideoStartResult {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn start_video(
    state: State<'_, AppState>,
    device_index: usize,
) -> Result<VideoStartResult, String> {
    // Stop existing capture first
    let was_running = state.video_running.swap(false, Ordering::Relaxed);
    if was_running {
        tracing::info!("Stopping previous capture before starting new one");
        // Wait for previous capture thread to exit
        std::thread::sleep(std::time::Duration::from_millis(300));
    }

    let config = state.config.lock().map_err(|e| e.to_string())?;
    let capture = VideoCapture::new(
        device_index,
        config.video.resolution_w,
        config.video.resolution_h,
        config.video.fps,
        config.video.format.clone(),
    )
    .map_err(|e| e.to_string())?;
    drop(config);

    let frame_buffer = state.frame_buffer.clone();
    let running = state.video_running.clone();
    running.store(true, Ordering::Relaxed);

    // Start capture thread
    let running_capture = running.clone();
    let buffer_capture = frame_buffer.clone();
    let video_resolution = state.video_resolution.clone();
    std::thread::spawn(move || {
        capture.run_loop(buffer_capture, running_capture, video_resolution);
    });

    // Start MJPEG stream server
    let running_stream = running.clone();
    let buffer_stream = frame_buffer.clone();
    std::thread::spawn(move || {
        if let Err(e) = stream::start_mjpeg_server(buffer_stream, running_stream) {
            tracing::error!("MJPEG server error: {}", e);
        }
    });

    // Wait for actual resolution to be determined (capture thread will write to video_resolution)
    std::thread::sleep(std::time::Duration::from_millis(1200));

    let (actual_w, actual_h) = *state.video_resolution.lock().map_err(|e| e.to_string())?;

    // Auto-sync mouse config screen resolution
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        if config.mouse.screen_w != actual_w || config.mouse.screen_h != actual_h {
            tracing::info!(
                "Auto-syncing mouse resolution: {}x{} → {}x{}",
                config.mouse.screen_w,
                config.mouse.screen_h,
                actual_w,
                actual_h
            );
            config.mouse.screen_w = actual_w;
            config.mouse.screen_h = actual_h;
        }
    }

    tracing::info!(
        "Video started on device {} at {}x{}",
        device_index,
        actual_w,
        actual_h
    );
    Ok(VideoStartResult {
        url: "http://127.0.0.1:9527/video".to_string(),
        width: actual_w,
        height: actual_h,
    })
}

#[tauri::command]
pub fn stop_video(state: State<'_, AppState>) -> Result<(), String> {
    state.video_running.store(false, Ordering::Relaxed);
    tracing::info!("Video stopped");
    Ok(())
}

#[tauri::command]
pub fn get_video_status(state: State<'_, AppState>) -> Result<StatusInfo, String> {
    let running = state.video_running.load(Ordering::Relaxed);
    let (w, h) = *state.video_resolution.lock().map_err(|e| e.to_string())?;
    Ok(StatusInfo {
        connected: running,
        detail: if running {
            format!("Streaming ({}x{})", w, h)
        } else {
            "Stopped".to_string()
        },
    })
}

// --- Config Commands ---

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(state: State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())?;
    let mut current = state.config.lock().map_err(|e| e.to_string())?;
    *current = config;
    tracing::info!("Config saved");
    Ok(())
}

// --- CH9329 Firmware Config Commands ---

/// Read CH9329 chip firmware version
#[tauri::command]
pub fn get_ch9329_version(state: State<'_, AppState>) -> Result<String, String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;

    let pkt = Ch9329::build_get_ver_packet();
    mgr.port_write_raw(&pkt).map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    let mut buf = [0u8; 64];
    let n = mgr.port_read_raw(&mut buf).unwrap_or(0);

    if n >= 13 && buf[0] == 0x57 && buf[1] == 0xAB && buf[3] == 0x81 {
        let ver_data = &buf[5..13];
        let hex: String = ver_data
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(" ");
        Ok(format!("V{}.{} ({})", ver_data[0], ver_data[1], hex))
    } else if n > 0 {
        let hex: String = buf[..n]
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(" ");
        Err(format!("Failed to parse version: {}", hex))
    } else {
        Err("No response".into())
    }
}

/// Read CH9329 chip configuration parameters
#[tauri::command]
pub fn get_ch9329_config(state: State<'_, AppState>) -> Result<Ch9329Config, String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;

    let pkt = Ch9329::build_get_para_cfg_packet();
    mgr.port_write_raw(&pkt).map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    let mut buf = [0u8; 128];
    let n = mgr.port_read_raw(&mut buf).unwrap_or(0);

    if n >= 55 && buf[0] == 0x57 && buf[1] == 0xAB && buf[3] == 0x88 {
        let config_bytes = &buf[5..55];
        Ok(Ch9329::parse_config(config_bytes))
    } else if n > 0 {
        let hex: String = buf[..n]
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(" ");
        Err(format!("Failed to parse config: {}", hex))
    } else {
        Err("No response".into())
    }
}

/// Write CH9329 chip configuration parameters (auto-reset after write)
#[tauri::command]
pub fn set_ch9329_config(
    state: State<'_, AppState>,
    config: Ch9329Config,
) -> Result<String, String> {
    let config_data = Ch9329::serialize_config(&config);
    if config_data.len() != 50 {
        return Err(format!(
            "Config data length error: {} (expected 50)",
            config_data.len()
        ));
    }

    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;

    // Send SET_PARA_CFG
    let pkt = Ch9329::build_set_para_cfg_packet(&config_data);
    mgr.port_write_raw(&pkt).map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    let mut buf = [0u8; 64];
    let n = mgr.port_read_raw(&mut buf).unwrap_or(0);

    if n >= 6 && buf[0] == 0x57 && buf[5] != 0x00 {
        return Err(format!("Write failed: status code 0x{:02X}", buf[5]));
    }

    // Send RESET to apply config
    let pkt = Ch9329::build_reset_packet();
    mgr.port_write_raw(&pkt).map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    let _ = mgr.port_read_raw(&mut buf);

    let _ = mgr;
    drop(serial);

    // Wait for chip restart
    std::thread::sleep(std::time::Duration::from_millis(2000));

    // Reconnect with new baud rate
    let new_baud = config.baud_rate;
    let port_name = {
        let cfg = state.config.lock().map_err(|e| e.to_string())?;
        cfg.serial.port.clone()
    };

    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    match SerialManager::open(&port_name, new_baud) {
        Ok(mut new_mgr) => {
            match new_mgr.probe_ch9329() {
                Ok(msg) => {
                    *serial = Some(new_mgr);
                    // Update baud rate in app config
                    if let Ok(mut cfg) = state.config.lock() {
                        cfg.serial.baud_rate = new_baud;
                    }
                    tracing::info!("CH9329 config saved, reconnected at {} baud", new_baud);
                    Ok(format!(
                        "Config saved and applied ({}bps): {}",
                        new_baud, msg
                    ))
                }
                Err(_) => {
                    // Baud rate might have changed, try other
                    let fallback = if new_baud == 9600 { 115200 } else { 9600 };
                    match SerialManager::open(&port_name, fallback) {
                        Ok(mut fb_mgr) => {
                            if fb_mgr.probe_ch9329().is_ok() {
                                *serial = Some(fb_mgr);
                                Ok(format!("Config saved, chip running at {}bps", fallback))
                            } else {
                                *serial = None;
                                Err("Config saved but unable to reconnect".into())
                            }
                        }
                        Err(_) => {
                            *serial = None;
                            Err(
                                "Config saved but unable to reconnect (please reconnect manually)"
                                    .into(),
                            )
                        }
                    }
                }
            }
        }
        Err(_) => {
            *serial = None;
            Err("Config saved but reconnection failed, please reconnect manually".into())
        }
    }
}

/// Restore CH9329 factory defaults
#[tauri::command]
pub fn reset_ch9329_default(state: State<'_, AppState>) -> Result<String, String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;

    // SET_DEFAULT_CFG
    let pkt = Ch9329::build_set_default_cfg_packet();
    mgr.port_write_raw(&pkt).map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    let mut buf = [0u8; 64];
    let n = mgr.port_read_raw(&mut buf).unwrap_or(0);

    if n >= 6 && buf[5] != 0x00 {
        return Err(format!(
            "Factory reset failed: status code 0x{:02X}",
            buf[5]
        ));
    }

    // RESET
    let pkt = Ch9329::build_reset_packet();
    mgr.port_write_raw(&pkt).map_err(|e| e.to_string())?;

    let _ = mgr;
    drop(serial);

    // Factory default baud rate is 9600
    std::thread::sleep(std::time::Duration::from_millis(2000));

    let port_name = {
        let cfg = state.config.lock().map_err(|e| e.to_string())?;
        cfg.serial.port.clone()
    };

    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    // Factory default 9600, try to connect
    for &baud in &[9600u32, 115200] {
        if let Ok(mut mgr) = SerialManager::open(&port_name, baud) {
            if mgr.probe_ch9329().is_ok() {
                *serial = Some(mgr);
                if let Ok(mut cfg) = state.config.lock() {
                    cfg.serial.baud_rate = baud;
                }
                return Ok(format!("Factory defaults restored (baud rate {}bps)", baud));
            }
        }
    }
    *serial = None;
    Err("Factory defaults restored but reconnection failed (factory default 9600bps, please reconnect manually)".into())
}

/// Mouse absolute mode zero calibration
#[tauri::command]
pub fn calibrate_mouse(state: State<'_, AppState>) -> Result<(), String> {
    let mut home = state.abs_needs_home.lock().map_err(|e| e.to_string())?;
    *home = true;
    tracing::info!("Mouse calibration requested");
    Ok(())
}

/// Send relative mouse packet directly (bypasses mode check, for quick action clicks/swipes)
#[tauri::command]
pub fn send_mouse_raw_rel(
    state: State<'_, AppState>,
    dx: i8,
    dy: i8,
    buttons: u8,
) -> Result<(), String> {
    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;
    let packet = Ch9329::build_mouse_rel_packet(dx, dy, buttons, 0);
    mgr.write(&packet).map_err(|e| e.to_string())
}

/// Move mouse to a specific pixel position on screen (zero + small step relative moves, unaffected by mouse acceleration)
///
/// Principle: First send enough max negative packets to move cursor to (0,0), then use step=5
/// small step relative moves to gradually reach the target. Most operating systems do not apply
/// acceleration to deltas <= 5 units.
/// The entire process takes about 0.3-0.8 seconds (depending on target coordinates).
#[tauri::command]
pub fn move_mouse_to_position(
    state: State<'_, AppState>,
    target_x: f64,
    target_y: f64,
) -> Result<(), String> {
    let (_screen_w, _screen_h) = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        (config.mouse.screen_w, config.mouse.screen_h)
    };

    let mut serial = state.serial.lock().map_err(|e| e.to_string())?;
    let mgr = serial.as_mut().ok_or("Serial not connected")?;

    // --- Phase 1: Zero to (0,0) ---
    // -127 × 40 ≈ -5080 pixels, far exceeds any screen width, ensures cursor reaches top-left corner
    let home_steps = 40usize;
    for i in 0..home_steps {
        let pkt = Ch9329::build_mouse_rel_packet(-127, -127, 0, 0);
        mgr.write(&pkt).map_err(|e| e.to_string())?;
        // Pause every 12 packets for 5ms to prevent CH9329 serial buffer overflow
        if i % 12 == 11 {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    }
    // Wait for zero to complete
    std::thread::sleep(std::time::Duration::from_millis(30));

    // --- Phase 2: Small step move to target ---
    // step=2: delta<=2 has acceleration factor 1.0 on all major operating systems
    let step: f64 = 2.0;
    let mut rx = target_x;
    let mut ry = target_y;
    let mut count = 0u32;

    while rx > 0.5 || ry > 0.5 {
        let dx = if rx >= step {
            step as i8
        } else if rx > 0.5 {
            rx.round().min(127.0) as i8
        } else {
            0
        };
        let dy = if ry >= step {
            step as i8
        } else if ry > 0.5 {
            ry.round().min(127.0) as i8
        } else {
            0
        };
        if dx == 0 && dy == 0 {
            break;
        }

        let pkt = Ch9329::build_mouse_rel_packet(dx, dy, 0, 0);
        mgr.write(&pkt).map_err(|e| e.to_string())?;
        rx -= dx as f64;
        ry -= dy as f64;
        count += 1;

        // Pause every 12 packets to prevent buffer overflow
        if count.is_multiple_of(12) {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    }

    // Sync virtual cursor position
    if let Ok(mut pos) = state.abs_cursor_pos.lock() {
        *pos = (target_x, target_y);
    }
    if let Ok(mut home) = state.abs_needs_home.lock() {
        *home = false;
    }

    tracing::info!(
        "Mouse positioned to ({}, {}) via {} relative packets",
        target_x,
        target_y,
        count
    );
    Ok(())
}
