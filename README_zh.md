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

## 参与贡献

欢迎通过以下方式参与：

- **反馈 Bug** — 提交 Issue 描述你遇到的问题
- **功能建议** — 提交 Issue 分享你的想法
- **提交 Pull Request** — 供参考。我们会认真审阅每一个 PR 的思路，但最终由团队自行实现修复，不会直接合并外部 PR。

## 许可证

MIT License
