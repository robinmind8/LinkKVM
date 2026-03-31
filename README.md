# LinkKVM

[中文文档](README_zh.md)

Open-source cross-platform IP-KVM client that enables keyboard/mouse control and screen display of a remote computer via USB HDMI capture card and CH9329 HID chip.

## Features

- Send keyboard/mouse commands to the target computer via CH9329 serial protocol
- Capture and display the target computer screen in real-time via USB HDMI capture card (UVC protocol)
- Support both absolute and relative mouse coordinate modes
- Quick action buttons (Ctrl+Alt+Del, PrintScreen, etc.)
- TOML configuration file format
- Cross-platform support for macOS, Windows, and Linux

## Tech Stack

- **Backend:** Rust + Tauri v2
- **Frontend:** React + TypeScript + Tailwind CSS
- **Serial Communication:** serialport crate
- **Video Streaming:** Local MJPEG HTTP stream (127.0.0.1:9527)

## Hardware Connection

```
Host Computer (running LinkKVM)
    |
    +-- USB --- HDMI Capture Card ---- HDMI ---- Target Computer (video output)
    |
    +-- USB --- CH340G (USB-to-TTL) -- UART ---- CH9329 -- USB -- Target Computer (keyboard/mouse input)
```

### Hardware List

| Component | Model | Reference Price |
|-----------|-------|----------------|
| HDMI Capture Card | MS2109 chipset | ~$2|
| USB HID Chip | CH9329 | ~$0.5 |
| USB to TTL | CH340G | ~$0.5 |
| Dupont Wires | - | ~$0.5 |

## Troubleshooting

### macOS: "LinkKVM is damaged and can't be opened"

This is caused by macOS Gatekeeper blocking unsigned applications. Since the CI-built app is not signed with an Apple Developer certificate, macOS treats it as potentially unsafe.

**Solution 1:** Remove the quarantine attribute via Terminal:

```bash
xattr -cr /Applications/LinkKVM.app
```

**Solution 2:** Right-click the app → select **Open** → click **Open** in the dialog (instead of double-clicking).

## Release Notes

### v0.1.0 — Initial Release

- **Remote Screen Capture** — Real-time display of target computer screen via USB HDMI capture card (UVC/MJPEG)
- **Keyboard Control** — Full keyboard input forwarding to target computer via CH9329 serial HID protocol
- **Mouse Control** — Support both absolute and relative mouse coordinate modes with movement, click, and scroll
- **Serial Port Management** — Auto-detect serial ports, configurable baud rate, connection status monitoring
- **Quick Actions** — One-click Ctrl+Alt+Del, PrintScreen, and other common key combinations
- **CH9329 Configuration** — Read/write chip parameters, factory reset, firmware version detection
- **Cross-Platform** — Native desktop apps for macOS (.dmg), Windows (.exe), and Linux (.deb)
- **TOML Configuration** — Persistent settings for serial port, video, and mouse preferences

## Contributing

We welcome your participation in the following ways:

- **Report Bugs** — Submit an Issue describing the problem you encountered
- **Suggest Features** — Submit an Issue with your feature ideas
- 🔧 **Submit a Pull Request** — We carefully review the approach behind every PR for reference, but the team implements fixes independently. External PRs will not be merged directly.

## License

MIT License
