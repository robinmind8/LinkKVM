# Changelog

[中文版](CHANGELOG_zh.md)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [v0.1.0] - 2026-03-31

### Added
- Real-time remote screen capture via USB HDMI capture card (UVC/MJPEG)
- Full keyboard input forwarding via CH9329 serial HID protocol
- Mouse control with both absolute and relative coordinate modes (movement, click, scroll)
- Auto-detect serial ports with configurable baud rate and connection monitoring
- Quick action buttons: Ctrl+Alt+Del, PrintScreen, and other key combinations
- CH9329 chip configuration: read/write parameters, factory reset, firmware version detection
- Cross-platform desktop apps for macOS (.dmg), Windows (.exe), and Linux (.deb)
- TOML configuration file for persistent serial, video, and mouse preferences
- Aptabase analytics integration for privacy-first usage tracking
- CI/CD pipeline with GitHub Actions for automated builds and releases

[v0.1.0]: https://github.com/robinmind8/LinkKVM/releases/tag/v0.1.0
