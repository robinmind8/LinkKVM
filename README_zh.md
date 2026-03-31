# LinkKVM

[English](README.md)

开源跨平台 IP-KVM 客户端，通过USB HDMI 采集卡和 CH9329 HID 芯片实现对远程计算机的键鼠控制与屏幕显示。

## 功能特性

- 通过 CH9329 串口协议向目标计算机发送键盘/鼠标指令
- 通过 USB HDMI 采集卡（UVC 协议）实时采集并显示目标计算机画面
- 支持绝对坐标和相对坐标两种鼠标模式
- 快捷操作按钮（Ctrl+Alt+Del、PrintScreen 等）
- TOML 配置文件格式
- 跨平台支持 macOS、Windows 和 Linux

## 技术栈

- **后端：** Rust + Tauri v2
- **前端：** React + TypeScript + Tailwind CSS
- **串口通信：** serialport crate
- **视频流：** 本地 MJPEG HTTP 流（127.0.0.1:9527）

## 硬件连接

```
主机（运行 LinkKVM）
    |
    +-- USB --- HDMI 采集卡 ---- HDMI ---- 目标计算机（视频输出）
    |
    +-- USB --- CH340G（USB 转 TTL）-- UART ---- CH9329 -- USB -- 目标计算机（键鼠输入）
```

### 硬件清单

| 组件 | 型号 | 参考价格 |
|------|------|----------|
| HDMI 采集卡 | MS2109 芯片 | ~¥10 |
| USB HID 芯片 | CH9329 | ~¥2 |
| USB 转 TTL | CH340G | ~¥5 |
| 杜邦线 | - | ~¥3 |

## 常见问题

### macOS 提示"LinkKVM 已损坏，无法打开"

这是由于 macOS Gatekeeper 安全机制阻止了未签名的应用程序。CI 构建的应用未使用 Apple 开发者证书签名，macOS 会将其视为不安全。

**方法一：** 在终端中移除隔离属性：

```bash
xattr -cr /Applications/LinkKVM.app
```

**方法二：** 右键点击应用 → 选择「打开」→ 在弹窗中点击「打开」（而非双击打开）。

## 更新日志

完整变更记录请查看 [CHANGELOG_zh.md](CHANGELOG_zh.md)。

### v0.1.0 — 首次发布

- **远程画面采集** — 通过 USB HDMI 采集卡（UVC/MJPEG）实时显示目标计算机屏幕
- **键盘控制** — 通过 CH9329 串口 HID 协议向目标计算机转发完整键盘输入
- **鼠标控制** — 支持绝对坐标和相对坐标两种模式，包含移动、点击、滚轮操作
- **串口管理** — 自动检测串口设备，可配置波特率，实时连接状态监控
- **快捷操作** — 一键发送 Ctrl+Alt+Del、PrintScreen 等常用组合键
- **CH9329 芯片配置** — 读写芯片参数、恢复出厂设置、固件版本检测
- **跨平台支持** — 提供 macOS（.dmg）、Windows（.exe）、Linux（.deb）原生桌面客户端
- **TOML 配置文件** — 持久化保存串口、视频、鼠标等偏好设置

## 参与贡献

欢迎通过以下方式参与：

- **反馈 Bug** — 提交 Issue 描述你遇到的问题
- **功能建议** — 提交 Issue 分享你的想法
- **提交 Pull Request** — 供参考。我们会认真审阅每一个 PR 的思路，但最终由团队自行实现修复，不会直接合并外部 PR。

## 许可证

MIT License
