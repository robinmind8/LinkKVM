# 更新日志

[English](CHANGELOG.md)

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [v0.1.0] - 2026-03-31

### 新增
- 通过 USB HDMI 采集卡（UVC/MJPEG）实时采集并显示远程计算机屏幕
- 通过 CH9329 串口 HID 协议转发完整键盘输入
- 鼠标控制支持绝对坐标和相对坐标两种模式（移动、点击、滚轮）
- 自动检测串口设备，可配置波特率，实时连接状态监控
- 快捷操作按钮：Ctrl+Alt+Del、PrintScreen 等常用组合键
- CH9329 芯片配置：读写参数、恢复出厂设置、固件版本检测
- 跨平台桌面客户端：macOS（.dmg）、Windows（.exe）、Linux（.deb）
- TOML 配置文件持久化保存串口、视频、鼠标偏好设置
- 集成 Aptabase 隐私优先分析统计
- GitHub Actions CI/CD 自动构建与发布

[v0.1.0]: https://github.com/robinmind8/LinkKVM/releases/tag/v0.1.0
