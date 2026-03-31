use crate::commands::DeviceInfo;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// UVC video capture module
///
/// Captures from AVFoundation (macOS) / V4L2 (Linux) / dshow (Windows) via ffmpeg subprocess,
/// outputs in MJPEG image2pipe format to stdout. Rust side parses JPEG frames into shared buffer.
pub struct VideoCapture {
    device_index: usize,
    width: u32,
    height: u32,
    fps: u32,
    format: String,
}

impl VideoCapture {
    /// Enumerate available UVC video devices in the system
    pub fn list_devices() -> Result<Vec<DeviceInfo>, Box<dyn std::error::Error>> {
        let mut devices = Vec::new();

        #[cfg(target_os = "linux")]
        {
            for i in 0..10 {
                let path = format!("/dev/video{}", i);
                if std::path::Path::new(&path).exists() {
                    let name =
                        std::fs::read_to_string(format!("/sys/class/video4linux/video{}/name", i))
                            .map(|s| s.trim().to_string())
                            .unwrap_or_else(|_| format!("Video Device {}", i));
                    devices.push(DeviceInfo { index: i, name });
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            devices = Self::list_devices_macos();
        }

        #[cfg(target_os = "windows")]
        {
            // Windows: no auto-enumeration yet, can add dshow detection later
        }

        if devices.is_empty() {
            tracing::warn!("No video devices found");
        } else {
            tracing::info!("Found {} video device(s)", devices.len());
        }

        Ok(devices)
    }

    /// macOS: Combine multiple methods to enumerate AVFoundation video devices
    #[cfg(target_os = "macos")]
    fn list_devices_macos() -> Vec<DeviceInfo> {
        // Method 1: system_profiler SPCameraDataType (most reliable, no third-party dependencies)
        if let Ok(devs) = Self::list_devices_system_profiler() {
            if !devs.is_empty() {
                tracing::info!("Enumerated devices via system_profiler");
                return devs;
            }
        }

        // Method 2: ffmpeg -f avfoundation (list all AVFoundation devices)
        if let Ok(devs) = Self::list_devices_ffmpeg() {
            if !devs.is_empty() {
                tracing::info!("Enumerated devices via ffmpeg");
                return devs;
            }
        }

        tracing::warn!("No macOS video device enumeration method succeeded");
        Vec::new()
    }

    /// Enumerate via system_profiler SPCameraDataType -json
    #[cfg(target_os = "macos")]
    fn list_devices_system_profiler() -> Result<Vec<DeviceInfo>, Box<dyn std::error::Error>> {
        let output = std::process::Command::new("system_profiler")
            .args(["SPCameraDataType", "-json"])
            .output()?;

        if !output.status.success() {
            return Err(format!("system_profiler exited with {}", output.status).into());
        }

        let json: serde_json::Value = serde_json::from_slice(&output.stdout)?;
        let cameras = json
            .get("SPCameraDataType")
            .and_then(|v| v.as_array())
            .ok_or("SPCameraDataType not found in JSON")?;

        let devices: Vec<DeviceInfo> = cameras
            .iter()
            .enumerate()
            .map(|(i, cam)| {
                let name = cam
                    .get("_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Camera")
                    .to_string();
                DeviceInfo { index: i, name }
            })
            .collect();

        Ok(devices)
    }

    /// Enumerate via ffmpeg -f avfoundation -list_devices true (macOS)
    #[cfg(target_os = "macos")]
    fn list_devices_ffmpeg() -> Result<Vec<DeviceInfo>, Box<dyn std::error::Error>> {
        // ffmpeg outputs device list to stderr
        let output = std::process::Command::new("ffmpeg")
            .args(["-f", "avfoundation", "-list_devices", "true", "-i", ""])
            .output()?;

        // ffmpeg -list_devices always returns exit 1, use stderr output
        let stderr = String::from_utf8_lossy(&output.stderr);
        let mut devices = Vec::new();
        let mut in_video_section = false;

        for line in stderr.lines() {
            if line.contains("AVFoundation video devices:") {
                in_video_section = true;
                continue;
            }
            if line.contains("AVFoundation audio devices:") {
                break;
            }
            if in_video_section {
                // Format: [AVFoundation indev @ 0x...] [0] Device Name
                if let Some(bracket_start) = line.find("] [") {
                    let rest = &line[bracket_start + 3..];
                    if let Some(bracket_end) = rest.find("] ") {
                        if let Ok(idx) = rest[..bracket_end].parse::<usize>() {
                            let name = rest[bracket_end + 2..].to_string();
                            // Exclude screen capture devices
                            if !name.starts_with("Capture screen") {
                                devices.push(DeviceInfo { index: idx, name });
                            }
                        }
                    }
                }
            }
        }

        Ok(devices)
    }

    /// Open video capture device
    pub fn new(
        device_index: usize,
        width: u32,
        height: u32,
        fps: u32,
        format: String,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        tracing::info!(
            "VideoCapture initialized: device={}, {}x{}@{}fps format={}",
            device_index,
            width,
            height,
            fps,
            format
        );

        Ok(Self {
            device_index,
            width,
            height,
            fps,
            format,
        })
    }

    /// Build ffmpeg command line arguments (platform-specific)
    fn build_ffmpeg_args(&self) -> Vec<String> {
        let mut args = Vec::new();

        #[cfg(target_os = "macos")]
        {
            args.extend_from_slice(&[
                "-f".into(),
                "avfoundation".into(),
                "-framerate".into(),
                self.fps.to_string(),
                "-video_size".into(),
                format!("{}x{}", self.width, self.height),
            ]);
            // Request native MJPEG from device to avoid CPU transcoding
            if self.format.eq_ignore_ascii_case("mjpeg") {
                args.extend_from_slice(&["-pixel_format".into(), "mjpeg".into()]);
            }
            args.extend_from_slice(&["-i".into(), self.device_index.to_string()]);
        }

        #[cfg(target_os = "linux")]
        {
            args.extend_from_slice(&[
                "-f".into(),
                "v4l2".into(),
                "-framerate".into(),
                self.fps.to_string(),
                "-video_size".into(),
                format!("{}x{}", self.width, self.height),
                "-i".into(),
                format!("/dev/video{}", self.device_index),
            ]);
        }

        #[cfg(target_os = "windows")]
        {
            args.extend_from_slice(&[
                "-f".into(),
                "dshow".into(),
                "-framerate".into(),
                self.fps.to_string(),
                "-video_size".into(),
                format!("{}x{}", self.width, self.height),
                "-i".into(),
                format!("video={}", self.device_index),
            ]);
        }

        // Output: MJPEG image2pipe to stdout
        args.extend_from_slice(&[
            "-f".into(),
            "image2pipe".into(),
            "-vcodec".into(),
            "mjpeg".into(),
            "-q:v".into(),
            "3".into(),
            "pipe:1".into(),
        ]);

        args
    }

    /// Try to start ffmpeg with specified resolution, fallback on failure
    /// Returns (child_process, actual_width, actual_height)
    fn try_start_ffmpeg(
        &self,
        running: &Arc<AtomicBool>,
    ) -> Result<(std::process::Child, u32, u32), String> {
        // Try user configured resolution, then fallback
        let resolutions = [
            (self.width, self.height, self.fps),
            (1920, 1080, 30),
            (1280, 720, 30),
            (640, 480, 30),
            (640, 480, 20),
            (640, 480, 15),
            (640, 480, 10),
            (640, 480, 5),
        ];

        let mut last_err = String::new();
        let mut tried = std::collections::HashSet::new();

        for (w, h, fps) in &resolutions {
            // Check if stopped
            if !running.load(Ordering::Relaxed) {
                return Err("Capture stopped during startup".into());
            }

            let key = format!("{}x{}@{}", w, h, fps);
            if !tried.insert(key.clone()) {
                continue;
            }

            tracing::info!(
                "Trying ffmpeg capture: {}x{}@{}fps device={}",
                w,
                h,
                fps,
                self.device_index
            );

            let capture = Self {
                device_index: self.device_index,
                width: *w,
                height: *h,
                fps: *fps,
                format: self.format.clone(),
            };

            let args = capture.build_ffmpeg_args();

            match std::process::Command::new("ffmpeg")
                .args(&args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
            {
                Ok(mut child) => {
                    // Wait briefly, check if ffmpeg exited immediately due to unsupported parameters
                    std::thread::sleep(std::time::Duration::from_millis(800));

                    // Check if stopped again
                    if !running.load(Ordering::Relaxed) {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err("Capture stopped during startup".into());
                    }

                    match child.try_wait() {
                        Ok(Some(status)) => {
                            // ffmpeg already exited, parameters not supported
                            let stderr_msg = child
                                .stderr
                                .take()
                                .and_then(|mut s| {
                                    let mut buf = String::new();
                                    std::io::Read::read_to_string(&mut s, &mut buf).ok()?;
                                    Some(buf)
                                })
                                .unwrap_or_default();
                            last_err = format!(
                                "ffmpeg exited {} for {}: {}",
                                status,
                                key,
                                stderr_msg
                                    .lines()
                                    .filter(|l| l.contains("not supported")
                                        || l.contains("Error")
                                        || l.contains("Invalid"))
                                    .collect::<Vec<_>>()
                                    .join("; ")
                            );
                            tracing::warn!("{}", last_err);
                            // If using MJPEG pixel_format and it failed, retry without it
                            if self.format.eq_ignore_ascii_case("mjpeg") {
                                tracing::info!("Retrying {} without -pixel_format mjpeg", key);
                                let capture_raw = Self {
                                    device_index: self.device_index,
                                    width: *w,
                                    height: *h,
                                    fps: *fps,
                                    format: "auto".to_string(),
                                };
                                let raw_args = capture_raw.build_ffmpeg_args();
                                if let Ok(mut child2) = std::process::Command::new("ffmpeg")
                                    .args(&raw_args)
                                    .stdout(std::process::Stdio::piped())
                                    .stderr(std::process::Stdio::piped())
                                    .spawn()
                                {
                                    std::thread::sleep(std::time::Duration::from_millis(800));
                                    if !running.load(Ordering::Relaxed) {
                                        let _ = child2.kill();
                                        let _ = child2.wait();
                                        return Err("Capture stopped during startup".into());
                                    }
                                    match child2.try_wait() {
                                        Ok(None) => {
                                            tracing::info!(
                                                "ffmpeg started (auto format): {}x{}@{}fps",
                                                w,
                                                h,
                                                fps
                                            );
                                            return Ok((child2, *w, *h));
                                        }
                                        _ => {
                                            let _ = child2.kill();
                                            let _ = child2.wait();
                                        }
                                    }
                                }
                            }
                            continue;
                        }
                        Ok(None) => {
                            // ffmpeg still running, capture started successfully
                            tracing::info!("ffmpeg started successfully: {}x{}@{}fps", w, h, fps);
                            return Ok((child, *w, *h));
                        }
                        Err(e) => {
                            last_err = format!("try_wait error for {}: {}", key, e);
                            tracing::warn!("{}", last_err);
                            let _ = child.kill();
                            continue;
                        }
                    }
                }
                Err(e) => {
                    last_err = format!("Failed to spawn ffmpeg ({}): {}", key, e);
                    tracing::warn!("{}", last_err);
                }
            }
        }

        Err(format!(
            "All ffmpeg resolutions failed. Last error: {}",
            last_err
        ))
    }

    /// Capture loop: capture frames via ffmpeg subprocess and write to shared buffer
    pub fn run_loop(
        self,
        buffer: Arc<Mutex<Vec<u8>>>,
        running: Arc<AtomicBool>,
        video_resolution: Arc<Mutex<(u32, u32)>>,
    ) {
        tracing::info!(
            "Capture loop starting: device={}, {}x{}@{}fps",
            self.device_index,
            self.width,
            self.height,
            self.fps,
        );

        let (mut child, actual_w, actual_h) = match self.try_start_ffmpeg(&running) {
            Ok(result) => result,
            Err(e) => {
                tracing::error!("Cannot start ffmpeg capture: {}", e);
                return;
            }
        };

        // Record actual capture resolution
        if let Ok(mut res) = video_resolution.lock() {
            *res = (actual_w, actual_h);
        }
        tracing::info!("Actual capture resolution: {}x{}", actual_w, actual_h);

        let mut stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                tracing::error!("Failed to get ffmpeg stdout");
                let _ = child.kill();
                return;
            }
        };

        // Asynchronously read ffmpeg log from stderr
        let stderr_handle = child.stderr.take().map(|stderr| {
            std::thread::spawn(move || {
                let mut reader = std::io::BufReader::new(stderr);
                let mut line = String::new();
                loop {
                    line.clear();
                    match std::io::BufRead::read_line(&mut reader, &mut line) {
                        Ok(0) => break,
                        Ok(_) => {
                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                tracing::debug!("ffmpeg: {}", trimmed);
                            }
                        }
                        Err(_) => break,
                    }
                }
            })
        });

        // Read MJPEG image2pipe stream: each frame starts with FFD8 and ends with FFD9
        let mut read_buf = [0u8; 65536];
        let mut frame_buf: Vec<u8> = Vec::with_capacity(256 * 1024);
        let mut in_frame = false;
        let mut frame_count: u64 = 0;
        let mut last_log = std::time::Instant::now();

        while running.load(Ordering::Relaxed) {
            let n = match stdout.read(&mut read_buf) {
                Ok(0) => {
                    tracing::warn!("ffmpeg stdout EOF");
                    break;
                }
                Ok(n) => n,
                Err(e) => {
                    tracing::error!("ffmpeg read error: {}", e);
                    break;
                }
            };

            let chunk = &read_buf[..n];
            let mut i = 0;

            while i < chunk.len() {
                if !in_frame {
                    // Find JPEG SOI marker: FF D8
                    if i + 1 < chunk.len() && chunk[i] == 0xFF && chunk[i + 1] == 0xD8 {
                        frame_buf.clear();
                        frame_buf.push(0xFF);
                        frame_buf.push(0xD8);
                        in_frame = true;
                        i += 2;
                    } else {
                        i += 1;
                    }
                } else {
                    // Inside frame, find EOI marker: FF D9
                    if i + 1 < chunk.len() && chunk[i] == 0xFF && chunk[i + 1] == 0xD9 {
                        frame_buf.push(0xFF);
                        frame_buf.push(0xD9);
                        in_frame = false;

                        // Complete frame received, write to shared buffer
                        if let Ok(mut buf) = buffer.lock() {
                            *buf = frame_buf.clone();
                        }
                        frame_count += 1;

                        if last_log.elapsed() >= std::time::Duration::from_secs(5) {
                            tracing::info!(
                                "Captured {} frames, last frame {} bytes",
                                frame_count,
                                frame_buf.len()
                            );
                            last_log = std::time::Instant::now();
                        }

                        i += 2;
                    } else {
                        frame_buf.push(chunk[i]);
                        i += 1;
                    }
                }
            }
        }

        // Stop ffmpeg
        tracing::info!("Stopping ffmpeg (total frames: {})", frame_count);
        let _ = child.kill();
        let _ = child.wait();
        if let Some(h) = stderr_handle {
            let _ = h.join();
        }

        tracing::info!("Capture loop stopped");
    }
}
