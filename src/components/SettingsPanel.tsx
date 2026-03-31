import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppConfig } from '../hooks/useConfig';
import { useTheme, type ThemeId } from '../contexts/ThemeContext';
import { log } from '../stores/eventLog';

interface PortInfo {
  name: string;
  port_type: string;
}

interface VideoDeviceInfo {
  index: number;
  name: string;
}

const VIDEO_PRESETS: Record<string, { w: number; h: number; fps: number; format: string; label: string }> = {
  ultra: { w: 1920, h: 1080, fps: 60, format: 'MJPEG', label: 'Ultra (1080p60 MJPEG)' },
  high: { w: 1920, h: 1080, fps: 30, format: 'MJPEG', label: 'High (1080p30 MJPEG)' },
  medium: { w: 1280, h: 720, fps: 30, format: 'MJPEG', label: 'Medium (720p30 MJPEG)' },
  low: { w: 640, h: 480, fps: 30, format: 'YUYV', label: 'Low (480p30 YUYV)' },
};

const THEME_OPTIONS: { id: ThemeId | 'auto'; label: string; desc: string; colors: [string, string, string] }[] = [
  { id: 'dark', label: 'Dark', desc: 'Classic dark theme', colors: ['#0f172a', '#1e293b', '#3b82f6'] },
  { id: 'light', label: 'Light', desc: 'Bright and clean', colors: ['#f1f5f9', '#ffffff', '#2563eb'] },
  { id: 'midnight', label: 'Midnight', desc: 'Violet night', colors: ['#0a0a1a', '#13132b', '#8b5cf6'] },
  { id: 'cyberpunk', label: 'Cyber', desc: 'Cyberpunk green glow', colors: ['#0a0f0d', '#0f1a16', '#10b981'] },
  { id: 'auto', label: 'Auto', desc: 'Follow system settings', colors: ['#6b7280', '#9ca3af', '#3b82f6'] },
];

interface SettingsPanelProps {
  config: AppConfig;
  onClose: () => void;
  onSave: (config: AppConfig) => void;
  onSerialConnected: (detail: string) => void;
  onSerialDisconnected: () => void;
  onSettingsOpened?: () => void;
  onConfigSaved?: (section: string) => void;
}

type TabId = 'serial' | 'video' | 'mouse' | 'ui' | 'test' | 'chip';

const TAB_ICONS: Record<TabId, JSX.Element> = {
  chip: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  test: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  serial: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  ),
  video: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  mouse: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="6" />
      <line x1="12" y1="6" x2="12" y2="10" />
    </svg>
  ),
  ui: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
};

export default function SettingsPanel({
  config,
  onClose,
  onSave,
  onSerialConnected,
  onSerialDisconnected,
  onSettingsOpened,
  onConfigSaved,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('serial');
  const [localConfig, setLocalConfig] = useState<AppConfig>({ ...config });
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [serialConnected, setSerialConnected] = useState(false);
  const [videoDevices, setVideoDevices] = useState<VideoDeviceInfo[]>([]);
  const { setTheme } = useTheme();

  // Track settings panel open
  useEffect(() => {
    onSettingsOpened?.();
  }, [onSettingsOpened]);

  // Auto-sync target resolution (auto-detected from video capture, not set manually by user)
  useEffect(() => {
    setLocalConfig(prev => {
      if (prev.mouse.screen_w !== config.mouse.screen_w || prev.mouse.screen_h !== config.mouse.screen_h) {
        return { ...prev, mouse: { ...prev.mouse, screen_w: config.mouse.screen_w, screen_h: config.mouse.screen_h } };
      }
      return prev;
    });
  }, [config.mouse.screen_w, config.mouse.screen_h]);

  // --- CH9329 Chip Config State ---
  interface ChipConfig {
    chip_mode: number;
    custom_string_enabled: boolean;
    usb_device_type: number;
    custom_vid_pid: boolean;
    serial_mode: number;
    baud_rate: number;
    packet_interval: number;
    vid: number;
    pid: number;
    ascii_filter_mode: number;
    ascii_post_char: number;
  }
  const [chipConfig, setChipConfig] = useState<ChipConfig | null>(null);
  const [chipVersion, setChipVersion] = useState<string>('');
  const [chipLoading, setChipLoading] = useState(false);
  const [chipMessage, setChipMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadChipConfig = useCallback(async () => {
    if (!serialConnected) return;
    setChipLoading(true);
    setChipMessage(null);
    try {
      const [ver, cfg] = await Promise.all([
        invoke<string>('get_ch9329_version').catch(() => 'Unknown'),
        invoke<ChipConfig>('get_ch9329_config'),
      ]);
      setChipVersion(ver);
      setChipConfig(cfg);
    } catch (e: any) {
      setChipMessage({ type: 'error', text: `Read failed: ${e}` });
    } finally {
      setChipLoading(false);
    }
  }, [serialConnected]);

  const saveChipConfig = useCallback(async () => {
    if (!chipConfig) return;
    setChipLoading(true);
    setChipMessage(null);
    try {
      const msg = await invoke<string>('set_ch9329_config', { config: chipConfig });
      setChipMessage({ type: 'success', text: msg });
      // Re-read to verify
      setTimeout(() => loadChipConfig(), 500);
    } catch (e: any) {
      setChipMessage({ type: 'error', text: `Write failed: ${e}` });
    } finally {
      setChipLoading(false);
    }
  }, [chipConfig, loadChipConfig]);

  const resetChipDefault = useCallback(async () => {
    setChipLoading(true);
    setChipMessage(null);
    try {
      const msg = await invoke<string>('reset_ch9329_default');
      setChipMessage({ type: 'success', text: msg });
      setTimeout(() => loadChipConfig(), 500);
    } catch (e: any) {
      setChipMessage({ type: 'error', text: `Reset failed: ${e}` });
    } finally {
      setChipLoading(false);
    }
  }, [loadChipConfig]);

  // Auto-load chip config when tab is selected
  useEffect(() => {
    if (activeTab === 'chip' && !chipConfig && serialConnected) {
      loadChipConfig();
    }
  }, [activeTab, chipConfig, serialConnected, loadChipConfig]);

  // --- HID Test State ---
  const [testLog, setTestLog] = useState<string[]>([]);
  const [testKeyActive, setTestKeyActive] = useState(false);
  const [testMouseActive, setTestMouseActive] = useState(false);
  const [lastTestKey, setLastTestKey] = useState('');
  const [mouseTestPos, setMouseTestPos] = useState({ x: 0, y: 0 });

  const addTestLog = useCallback((msg: string) => {
    setTestLog(prev => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const handleTestKeyboard = useCallback(async () => {
    if (!serialConnected) { addTestLog('❌ Serial not connected'); return; }
    addTestLog('⌨️ Test: pressing A key...');
    try {
      await invoke('send_key', { modifier: 0, keycodes: [0x04] }); // A key
      await new Promise(r => setTimeout(r, 100));
      await invoke('release_keys');
      addTestLog('✅ A key sent successfully (press + release)');
    } catch (e: any) { addTestLog(`❌ Keyboard send failed: ${e}`); }
  }, [serialConnected, addTestLog]);

  const handleTestModifierKey = useCallback(async () => {
    if (!serialConnected) { addTestLog('❌ Serial not connected'); return; }
    addTestLog('⌨️ Test: Ctrl+A...');
    try {
      await invoke('send_key', { modifier: 0x01, keycodes: [0x04] }); // Ctrl+A
      await new Promise(r => setTimeout(r, 100));
      await invoke('release_keys');
      addTestLog('✅ Ctrl+A sent successfully');
    } catch (e: any) { addTestLog(`❌ Send failed: ${e}`); }
  }, [serialConnected, addTestLog]);

  const handleTestMouseLeft = useCallback(async () => {
    if (!serialConnected) { addTestLog('❌ Serial not connected'); return; }
    addTestLog('🖱️ Test: left click (screen center)...');
    try {
      const cx = localConfig.mouse.screen_w / 2;
      const cy = localConfig.mouse.screen_h / 2;
      await invoke('send_mouse_click', { x: cx, y: cy, buttons: 0x01 });
      await new Promise(r => setTimeout(r, 80));
      await invoke('send_mouse_click', { x: cx, y: cy, buttons: 0x00 });
      addTestLog('✅ Left click sent successfully');
    } catch (e: any) { addTestLog(`❌ Mouse send failed: ${e}`); }
  }, [serialConnected, localConfig.mouse.screen_w, localConfig.mouse.screen_h, addTestLog]);

  const handleTestMouseRight = useCallback(async () => {
    if (!serialConnected) { addTestLog('❌ Serial not connected'); return; }
    addTestLog('🖱️ Test: right click (screen center)...');
    try {
      const cx = localConfig.mouse.screen_w / 2;
      const cy = localConfig.mouse.screen_h / 2;
      await invoke('send_mouse_click', { x: cx, y: cy, buttons: 0x02 });
      await new Promise(r => setTimeout(r, 80));
      await invoke('send_mouse_click', { x: cx, y: cy, buttons: 0x00 });
      addTestLog('✅ Right click sent successfully');
    } catch (e: any) { addTestLog(`❌ Mouse send failed: ${e}`); }
  }, [serialConnected, localConfig.mouse.screen_w, localConfig.mouse.screen_h, addTestLog]);

  const handleTestMouseMove = useCallback(async () => {
    if (!serialConnected) { addTestLog('❌ Serial not connected'); return; }
    addTestLog('🖱️ Test: mouse movement (draw square)...');
    try {
      const sw = localConfig.mouse.screen_w;
      const sh = localConfig.mouse.screen_h;
      const points = [
        { x: sw * 0.3, y: sh * 0.3 },
        { x: sw * 0.7, y: sh * 0.3 },
        { x: sw * 0.7, y: sh * 0.7 },
        { x: sw * 0.3, y: sh * 0.7 },
        { x: sw * 0.3, y: sh * 0.3 },
      ];
      for (const p of points) {
        await invoke('send_mouse_move', { x: p.x, y: p.y, buttons: 0 });
        await new Promise(r => setTimeout(r, 200));
      }
      addTestLog('✅ Mouse square movement completed');
    } catch (e: any) { addTestLog(`❌ Mouse movement failed: ${e}`); }
  }, [serialConnected, localConfig.mouse.screen_w, localConfig.mouse.screen_h, addTestLog]);

  const handleTestScroll = useCallback(async () => {
    if (!serialConnected) { addTestLog('❌ Serial not connected'); return; }
    addTestLog('🖱️ Test: scroll up 3 notches...');
    try {
      for (let i = 0; i < 3; i++) {
        await invoke('send_mouse_scroll', { delta: 1 });
        await new Promise(r => setTimeout(r, 100));
      }
      addTestLog('✅ Scroll sent successfully');
    } catch (e: any) { addTestLog(`❌ Scroll failed: ${e}`); }
  }, [serialConnected, addTestLog]);

  // Interactive keyboard test handler
  const handleTestKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!serialConnected) return;
    const code = e.code;
    setLastTestKey(code);

    let modifier = 0;
    if (e.ctrlKey) modifier |= e.location === 2 ? 0x10 : 0x01;
    if (e.shiftKey) modifier |= e.location === 2 ? 0x20 : 0x02;
    if (e.altKey) modifier |= e.location === 2 ? 0x40 : 0x04;
    if (e.metaKey) modifier |= e.location === 2 ? 0x80 : 0x08;

    // Quick inline keymap
    const KEY_MAP: Record<string, number> = {
      KeyA:0x04,KeyB:0x05,KeyC:0x06,KeyD:0x07,KeyE:0x08,KeyF:0x09,KeyG:0x0a,KeyH:0x0b,KeyI:0x0c,KeyJ:0x0d,
      KeyK:0x0e,KeyL:0x0f,KeyM:0x10,KeyN:0x11,KeyO:0x12,KeyP:0x13,KeyQ:0x14,KeyR:0x15,KeyS:0x16,KeyT:0x17,
      KeyU:0x18,KeyV:0x19,KeyW:0x1a,KeyX:0x1b,KeyY:0x1c,KeyZ:0x1d,
      Digit1:0x1e,Digit2:0x1f,Digit3:0x20,Digit4:0x21,Digit5:0x22,Digit6:0x23,Digit7:0x24,Digit8:0x25,Digit9:0x26,Digit0:0x27,
      Enter:0x28,Escape:0x29,Backspace:0x2a,Tab:0x2b,Space:0x2c,
      F1:0x3a,F2:0x3b,F3:0x3c,F4:0x3d,F5:0x3e,F6:0x3f,F7:0x40,F8:0x41,F9:0x42,F10:0x43,F11:0x44,F12:0x45,
      ArrowUp:0x52,ArrowDown:0x51,ArrowLeft:0x50,ArrowRight:0x4f,
    };
    const keycode = KEY_MAP[code] || 0;
    if (keycode === 0 && modifier === 0) return;

    try {
      await invoke('send_key', { modifier, keycodes: keycode > 0 ? [keycode] : [] });
      addTestLog(`⌨️ Sent: ${code} (mod=0x${modifier.toString(16)}, key=0x${keycode.toString(16)})`);
    } catch (e: any) { addTestLog(`❌ ${e}`); }
  }, [serialConnected, addTestLog]);

  const handleTestKeyUp = useCallback(async (e: React.KeyboardEvent) => {
    e.preventDefault();
    if (!serialConnected) return;
    try {
      await invoke('release_keys');
    } catch (_) {}
  }, [serialConnected]);

  // Interactive mouse test handler
  const handleTestMouseMove_interactive = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!serialConnected || !testMouseActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const sx = rx * localConfig.mouse.screen_w;
    const sy = ry * localConfig.mouse.screen_h;
    setMouseTestPos({ x: Math.round(sx), y: Math.round(sy) });
    try {
      await invoke('send_mouse_move', { x: sx, y: sy, buttons: 0 });
    } catch (_) {}
  }, [serialConnected, testMouseActive, localConfig.mouse.screen_w, localConfig.mouse.screen_h]);

  const handleTestMouseClick_interactive = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!serialConnected || !testMouseActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * localConfig.mouse.screen_w;
    const sy = ((e.clientY - rect.top) / rect.height) * localConfig.mouse.screen_h;
    const btn = e.button === 2 ? 0x02 : 0x01;
    try {
      await invoke('send_mouse_click', { x: sx, y: sy, buttons: btn });
      await new Promise(r => setTimeout(r, 80));
      await invoke('send_mouse_click', { x: sx, y: sy, buttons: 0 });
      addTestLog(`🖱️ Click (${Math.round(sx)}, ${Math.round(sy)}) btn=${btn === 1 ? 'left' : 'right'}`);
    } catch (e: any) { addTestLog(`❌ ${e}`); }
  }, [serialConnected, testMouseActive, localConfig.mouse.screen_w, localConfig.mouse.screen_h, addTestLog]);

  const refreshPorts = useCallback(async () => {
    try {
      const result = await invoke<PortInfo[]>('list_serial_ports');
      setPorts(result);
    } catch (e) {
      console.error('Failed to list ports:', e);
    }
  }, []);

  const refreshVideoDevices = useCallback(async () => {
    try {
      const result = await invoke<VideoDeviceInfo[]>('list_video_devices');
      setVideoDevices(result);
    } catch (e) {
      console.error('Failed to list video devices:', e);
    }
  }, []);

  useEffect(() => {
    refreshPorts();
    refreshVideoDevices();
    invoke<{ connected: boolean }>('get_serial_status').then((s) => {
      setSerialConnected(s.connected);
    });
  }, [refreshPorts, refreshVideoDevices]);

  const handleConnect = async () => {
    log.info('serial', `Connecting ${localConfig.serial.port} @ ${localConfig.serial.baud_rate}bps...`);
    try {
      const probeResult = await invoke<string>('connect_serial', {
        port: localConfig.serial.port,
        baudRate: localConfig.serial.baud_rate,
      });
      setSerialConnected(true);
      onSerialConnected(
        `${localConfig.serial.port} @ ${localConfig.serial.baud_rate}bps`
      );
      log.info('serial', `Serial connected: ${localConfig.serial.port}`);
      log.info('serial', `CH9329 probe: ${probeResult}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('serial', `Serial connection failed: ${msg}`);
      console.error('Connect error:', e);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke('disconnect_serial');
      setSerialConnected(false);
      onSerialDisconnected();
      log.info('serial', 'Serial disconnected');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('serial', `Disconnect serial failed: ${msg}`);
      console.error('Disconnect error:', e);
    }
  };

  const handleSave = () => {
    onSave(localConfig);
    onConfigSaved?.(activeTab);
    onClose();
  };

  const handleReset = () => {
    setLocalConfig({ ...config });
  };

  const updateSerial = (field: string, value: string | number | boolean) => {
    setLocalConfig((prev) => ({
      ...prev,
      serial: { ...prev.serial, [field]: value },
    }));
  };

  const updateVideo = (field: string, value: string | number | boolean) => {
    setLocalConfig((prev) => ({
      ...prev,
      video: { ...prev.video, [field]: value },
    }));
  };

  const handlePresetChange = (preset: string) => {
    const p = VIDEO_PRESETS[preset];
    if (p) {
      setLocalConfig((prev) => ({
        ...prev,
        video: {
          ...prev.video,
          preset,
          resolution_w: p.w,
          resolution_h: p.h,
          fps: p.fps,
          format: p.format,
        },
      }));
    }
  };

  const updateMouse = (field: string, value: string | number) => {
    setLocalConfig((prev) => ({
      ...prev,
      mouse: { ...prev.mouse, [field]: value },
    }));
  };

  const updateUi = (field: string, value: string | number | boolean) => {
    setLocalConfig((prev) => ({
      ...prev,
      ui: { ...prev.ui, [field]: value },
    }));
  };

  const handleThemeSelect = (themeId: ThemeId | 'auto') => {
    updateUi('theme', themeId);
    // Apply immediately for preview
    setTheme(themeId);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'serial', label: 'Serial' },
    { id: 'video', label: 'Video' },
    { id: 'mouse', label: 'Mouse' },
    { id: 'chip', label: 'Chip' },
    { id: 'ui', label: 'UI' },
    { id: 'test', label: 'Test' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-th-surface border border-th-border rounded-2xl shadow-2xl w-[580px] max-h-[80vh] flex flex-col overflow-hidden transition-colors duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-th-border">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-th-accent">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <h2 className="text-sm font-semibold text-th-text">Settings</h2>
          </div>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg text-th-text-dim hover:bg-th-overlay hover:text-th-text transition-colors"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Tab list */}
          <div className="w-[88px] bg-th-base border-r border-th-border py-2 flex flex-col gap-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`mx-1.5 flex flex-col items-center gap-1 text-[11px] px-2 py-2.5 rounded-lg transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-th-accent text-white font-medium shadow-sm'
                    : 'text-th-text-sub hover:text-th-text hover:bg-th-overlay'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {TAB_ICONS[tab.id]}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 p-5 overflow-y-auto">
            {activeTab === 'serial' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                    Serial Port
                  </label>
                  <div className="flex gap-2">
                    <select
                      className="input-base flex-1"
                      value={localConfig.serial.port}
                      onChange={(e) => updateSerial('port', e.target.value)}
                    >
                      <option value="">Select...</option>
                      {ports.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} ({p.port_type})
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-ghost border border-th-border"
                      onClick={refreshPorts}
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                    Baud Rate
                  </label>
                  <select
                    className="input-base"
                    value={localConfig.serial.baud_rate}
                    onChange={(e) =>
                      updateSerial('baud_rate', parseInt(e.target.value))
                    }
                  >
                    {[9600, 19200, 38400, 57600, 115200].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-th-accent"
                    checked={localConfig.serial.auto_detect}
                    onChange={(e) =>
                      updateSerial('auto_detect', e.target.checked)
                    }
                  />
                  <span className="text-sm text-th-text">Auto-detect device on startup</span>
                </label>

                <div className="pt-3 border-t border-th-border">
                  <div className="flex items-center gap-3">
                    {serialConnected ? (
                      <button
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-th-danger/15 text-th-danger border border-th-danger/30 hover:bg-th-danger/25 transition-all duration-200 active:scale-[0.97]"
                        onClick={handleDisconnect}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={handleConnect}
                        disabled={!localConfig.serial.port}
                      >
                        Connect
                      </button>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${serialConnected ? 'bg-th-success status-pulse' : 'bg-th-text-dim'}`} />
                      <span className="text-xs text-th-text-sub">
                        {serialConnected ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'video' && (
              <div className="space-y-4">
                {/* Device selection */}
                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                    Capture Device
                  </label>
                  <div className="flex gap-2">
                    <select
                      className="input-base flex-1"
                      value={localConfig.video.device_index}
                      onChange={(e) =>
                        updateVideo('device_index', parseInt(e.target.value))
                      }
                    >
                      {videoDevices.length > 0 ? (
                        videoDevices.map((d) => (
                          <option key={d.index} value={d.index}>
                            {d.name}
                          </option>
                        ))
                      ) : (
                        <option value={localConfig.video.device_index}>
                          Device {localConfig.video.device_index}
                        </option>
                      )}
                    </select>
                    <button
                      className="btn-ghost border border-th-border"
                      onClick={refreshVideoDevices}
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Use preset */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-th-accent"
                    checked={localConfig.video.use_preset}
                    onChange={(e) =>
                      updateVideo('use_preset', e.target.checked)
                    }
                  />
                  <span className="text-sm text-th-text">Use Preset</span>
                </label>

                {/* Preset dropdown or manual settings */}
                {localConfig.video.use_preset ? (
                  <div>
                    <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                      Preset
                    </label>
                    <select
                      className="input-base"
                      value={localConfig.video.preset}
                      onChange={(e) => handlePresetChange(e.target.value)}
                    >
                      {Object.entries(VIDEO_PRESETS).map(([key, p]) => (
                        <option key={key} value={key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                          Width
                        </label>
                        <input
                          type="number"
                          className="input-base"
                          value={localConfig.video.resolution_w}
                          onChange={(e) =>
                            updateVideo(
                              'resolution_w',
                              parseInt(e.target.value) || 1920
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                          Height
                        </label>
                        <input
                          type="number"
                          className="input-base"
                          value={localConfig.video.resolution_h}
                          onChange={(e) =>
                            updateVideo(
                              'resolution_h',
                              parseInt(e.target.value) || 1080
                            )
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                        Frame Rate
                      </label>
                      <select
                        className="input-base"
                        value={localConfig.video.fps}
                        onChange={(e) =>
                          updateVideo('fps', parseInt(e.target.value))
                        }
                      >
                        {[15, 24, 25, 30, 60].map((fps) => (
                          <option key={fps} value={fps}>
                            {fps} fps
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                        Pixel Format
                      </label>
                      <select
                        className="input-base"
                        value={localConfig.video.format}
                        onChange={(e) => updateVideo('format', e.target.value)}
                      >
                        <option value="MJPEG">MJPEG</option>
                        <option value="YUYV">YUYV</option>
                        <option value="NV12">NV12</option>
                        <option value="H264">H.264</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Use buffering */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-th-accent"
                    checked={localConfig.video.use_buffering}
                    onChange={(e) =>
                      updateVideo('use_buffering', e.target.checked)
                    }
                  />
                  <span className="text-sm text-th-text">Use Buffering</span>
                </label>
              </div>
            )}

            {activeTab === 'mouse' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                    Coordinate Mode
                  </label>
                  <select
                    className="input-base"
                    value={localConfig.mouse.mode}
                    onChange={(e) => updateMouse('mode', e.target.value)}
                  >
                    <option value="absolute">Absolute</option>
                    <option value="relative">Relative</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                      Target Width
                    </label>
                    <div className="input-base bg-th-overlay/50 text-th-text-sub cursor-default flex items-center justify-between">
                      <span>{localConfig.mouse.screen_w}</span>
                      <span className="text-[10px] text-th-accent">Auto</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                      Target Height
                    </label>
                    <div className="input-base bg-th-overlay/50 text-th-text-sub cursor-default flex items-center justify-between">
                      <span>{localConfig.mouse.screen_h}</span>
                      <span className="text-[10px] text-th-accent">Auto</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                    Sensitivity
                  </label>
                  <div className="relative pt-1 pb-4">
                    <input
                      type="range"
                      className="slider-enhanced w-full"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={localConfig.mouse.sensitivity}
                      onChange={(e) =>
                        updateMouse('sensitivity', parseFloat(e.target.value))
                      }
                    />
                    {/* Value display */}
                    <div className="flex items-center justify-center mt-2 gap-2">
                      <span className="text-lg font-mono font-semibold text-th-accent">
                        {localConfig.mouse.sensitivity.toFixed(1)}
                      </span>
                      {localConfig.mouse.sensitivity === 1.0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-th-success/20 text-th-success border border-th-success/30">
                          Recommended
                        </span>
                      )}
                    </div>
                    {/* Markers */}
                    <div className="flex justify-between text-[10px] text-th-text-dim mt-1 px-0.5">
                      {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0].map(v => (
                        <button
                          key={v}
                          className={`px-1 py-0.5 rounded transition-colors ${
                            localConfig.mouse.sensitivity === v
                              ? 'text-th-accent font-medium'
                              : 'hover:text-th-text cursor-pointer'
                          }`}
                          onClick={() => updateMouse('sensitivity', v)}
                        >
                          {v === 1.0 ? '1.0★' : v.toFixed(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'chip' && (
              <div className="space-y-4">
                {/* Connection check */}
                {!serialConnected ? (
                  <div className="text-center py-8 text-th-text-dim text-sm">
                    Please connect a device in the "Serial" tab first
                  </div>
                ) : (
                  <>
                    {/* Version & Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-th-text-sub">Firmware version:</span>
                        <span className="text-xs font-mono text-th-accent">{chipVersion || '—'}</span>
                      </div>
                      <button
                        className="btn-ghost border border-th-border text-xs px-3 py-1.5 disabled:opacity-40"
                        disabled={chipLoading}
                        onClick={loadChipConfig}
                      >
                        {chipLoading ? 'Reading...' : 'Read Config'}
                      </button>
                    </div>

                    {/* Message */}
                    {chipMessage && (
                      <div className={`text-xs px-3 py-2 rounded-lg border ${
                        chipMessage.type === 'success'
                          ? 'bg-th-success/10 border-th-success/30 text-th-success'
                          : 'bg-th-danger/10 border-th-danger/30 text-th-danger'
                      }`}>
                        {chipMessage.text}
                      </div>
                    )}

                    {chipConfig && (
                      <>
                        {/* Chip mode */}
                        <div>
                          <label className="block text-xs font-medium text-th-text-sub mb-1.5">Chip Mode</label>
                          <select
                            className="input-base"
                            value={chipConfig.chip_mode}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, chip_mode: parseInt(e.target.value) } : null)}
                          >
                            <option value={0}>Mode 0 — Keyboard + Mouse + Custom HID</option>
                            <option value={1}>Mode 1 — Keyboard + Mouse</option>
                            <option value={2}>Mode 2 — Custom HID Only</option>
                            <option value={3}>Mode 3 — Keyboard Only</option>
                          </select>
                        </div>

                        {/* USB device type */}
                        <div>
                          <label className="block text-xs font-medium text-th-text-sub mb-1.5">USB Device Type</label>
                          <select
                            className="input-base"
                            value={chipConfig.usb_device_type}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, usb_device_type: parseInt(e.target.value) } : null)}
                          >
                            <option value={0}>Type 0 — Standard Keyboard/Mouse</option>
                            <option value={1}>Type 1 — With Absolute Positioning</option>
                            <option value={2}>Type 2</option>
                            <option value={3}>Type 3</option>
                          </select>
                        </div>

                        {/* Serial mode */}
                        <div>
                          <label className="block text-xs font-medium text-th-text-sub mb-1.5">Serial Communication Mode</label>
                          <select
                            className="input-base"
                            value={chipConfig.serial_mode}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, serial_mode: parseInt(e.target.value) } : null)}
                          >
                            <option value={0}>Protocol Mode</option>
                            <option value={1}>Passthrough Mode</option>
                          </select>
                        </div>

                        {/* Baud rate */}
                        <div>
                          <label className="block text-xs font-medium text-th-text-sub mb-1.5">Baud Rate</label>
                          <select
                            className="input-base"
                            value={chipConfig.baud_rate}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, baud_rate: parseInt(e.target.value) } : null)}
                          >
                            {[9600, 19200, 38400, 57600, 115200].map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>

                        {/* Packet interval */}
                        <div>
                          <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                            Serial Packet Interval
                            <span className="ml-1 font-mono text-th-accent">{chipConfig.packet_interval}ms</span>
                          </label>
                          <input
                            type="range"
                            className="slider-enhanced w-full"
                            min="0"
                            max="100"
                            step="1"
                            value={chipConfig.packet_interval}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, packet_interval: parseInt(e.target.value) } : null)}
                          />
                        </div>

                        <div className="border-t border-th-border" />

                        {/* VID/PID */}
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded accent-th-accent"
                            checked={chipConfig.custom_vid_pid}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, custom_vid_pid: e.target.checked } : null)}
                          />
                          <span className="text-sm text-th-text">Use Custom VID/PID</span>
                        </label>

                        {chipConfig.custom_vid_pid && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-th-text-sub mb-1.5">VID</label>
                              <input
                                type="text"
                                className="input-base font-mono"
                                value={chipConfig.vid.toString(16).toUpperCase().padStart(4, '0')}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 16);
                                  if (!isNaN(v) && v >= 0 && v <= 0xFFFF) setChipConfig(prev => prev ? { ...prev, vid: v } : null);
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-th-text-sub mb-1.5">PID</label>
                              <input
                                type="text"
                                className="input-base font-mono"
                                value={chipConfig.pid.toString(16).toUpperCase().padStart(4, '0')}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 16);
                                  if (!isNaN(v) && v >= 0 && v <= 0xFFFF) setChipConfig(prev => prev ? { ...prev, pid: v } : null);
                                }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="border-t border-th-border" />

                        {/* Custom string descriptor */}
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded accent-th-accent"
                            checked={chipConfig.custom_string_enabled}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, custom_string_enabled: e.target.checked } : null)}
                          />
                          <span className="text-sm text-th-text">Enable Custom String Descriptor</span>
                        </label>

                        {/* ASCII filter */}
                        <div>
                          <label className="block text-xs font-medium text-th-text-sub mb-1.5">ASCII Character Filter</label>
                          <select
                            className="input-base"
                            value={chipConfig.ascii_filter_mode}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, ascii_filter_mode: parseInt(e.target.value) } : null)}
                          >
                            <option value={0}>No Filter</option>
                            <option value={1}>Filter</option>
                          </select>
                        </div>

                        {/* ASCII post char */}
                        <div>
                          <label className="block text-xs font-medium text-th-text-sub mb-1.5">
                            ASCII Suffix Character
                            <span className="ml-1 font-mono text-th-accent">0x{chipConfig.ascii_post_char.toString(16).toUpperCase().padStart(2, '0')}</span>
                          </label>
                          <select
                            className="input-base"
                            value={chipConfig.ascii_post_char}
                            onChange={(e) => setChipConfig(prev => prev ? { ...prev, ascii_post_char: parseInt(e.target.value) } : null)}
                          >
                            <option value={0}>None (0x00)</option>
                            <option value={0x0D}>CR (0x0D)</option>
                            <option value={0x0A}>LF (0x0A)</option>
                          </select>
                        </div>

                        <div className="border-t border-th-border" />

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            className="btn-primary flex-1 disabled:opacity-40"
                            disabled={chipLoading}
                            onClick={saveChipConfig}
                          >
                            {chipLoading ? 'Writing...' : 'Write Config'}
                          </button>
                          <button
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-th-danger/15 text-th-danger border border-th-danger/30 hover:bg-th-danger/25 transition-all duration-200 disabled:opacity-40"
                            disabled={chipLoading}
                            onClick={resetChipDefault}
                          >
                            Factory Reset
                          </button>
                        </div>
                        <p className="text-[10px] text-th-text-dim">
                          ⚠️ After writing config, the chip will restart. Baud rate changes will auto-reconnect. Factory reset will restore to 9600bps.
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'ui' && (
              <div className="space-y-5">
                {/* Theme picker */}
                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-3">
                    Theme Style
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {THEME_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        className={`relative p-2.5 rounded-xl border-2 transition-all duration-200 text-left ${
                          localConfig.ui.theme === t.id
                            ? 'border-th-accent shadow-glow-sm'
                            : 'border-th-border hover:border-th-text-dim'
                        }`}
                        onClick={() => handleThemeSelect(t.id)}
                      >
                        {/* Color preview */}
                        <div className="flex gap-0.5 mb-2 rounded-md overflow-hidden h-5">
                          <div className="flex-1" style={{ backgroundColor: t.colors[0] }} />
                          <div className="flex-1" style={{ backgroundColor: t.colors[1] }} />
                          <div className="w-3" style={{ backgroundColor: t.colors[2] }} />
                        </div>
                        <div className="text-xs font-medium text-th-text">{t.label}</div>
                        <div className="text-[10px] text-th-text-dim">{t.desc}</div>
                        {localConfig.ui.theme === t.id && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-th-accent flex items-center justify-center">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-th-border" />

                {/* Display options */}
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-th-text-sub">
                    Display Options
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-th-accent"
                      checked={localConfig.ui.show_fps}
                      onChange={(e) => updateUi('show_fps', e.target.checked)}
                    />
                    <span className="text-sm text-th-text">Show FPS</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-th-accent"
                      checked={localConfig.ui.show_status_bar}
                      onChange={(e) =>
                        updateUi('show_status_bar', e.target.checked)
                      }
                    />
                    <span className="text-sm text-th-text">Show Status Bar</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'test' && (
              <div className="space-y-4">
                {/* Connection status */}
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${serialConnected ? 'bg-th-success status-pulse' : 'bg-th-text-dim'}`} />
                  <span className="text-th-text-sub">{serialConnected ? 'Serial connected — ready to test' : 'Please connect serial first'}</span>
                </div>

                {/* Quick test buttons */}
                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-2">Quick Tests</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn-ghost border border-th-border text-xs py-2 disabled:opacity-40" disabled={!serialConnected} onClick={handleTestKeyboard}>
                      ⌨️ Key A
                    </button>
                    <button className="btn-ghost border border-th-border text-xs py-2 disabled:opacity-40" disabled={!serialConnected} onClick={handleTestModifierKey}>
                      ⌨️ Ctrl+A
                    </button>
                    <button className="btn-ghost border border-th-border text-xs py-2 disabled:opacity-40" disabled={!serialConnected} onClick={handleTestMouseLeft}>
                      🖱️ Left Click
                    </button>
                    <button className="btn-ghost border border-th-border text-xs py-2 disabled:opacity-40" disabled={!serialConnected} onClick={handleTestMouseRight}>
                      🖱️ Right Click
                    </button>
                    <button className="btn-ghost border border-th-border text-xs py-2 disabled:opacity-40" disabled={!serialConnected} onClick={handleTestMouseMove}>
                      🖱️ Move(Square)
                    </button>
                    <button className="btn-ghost border border-th-border text-xs py-2 disabled:opacity-40" disabled={!serialConnected} onClick={handleTestScroll}>
                      🖱️ Scroll Up
                    </button>
                  </div>
                </div>

                <div className="border-t border-th-border" />

                {/* Interactive keyboard test */}
                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-2">Interactive Keyboard Test</label>
                  <div
                    tabIndex={0}
                    className={`h-16 rounded-lg border-2 flex items-center justify-center text-sm cursor-text transition-all duration-200 ${
                      testKeyActive
                        ? 'border-th-accent bg-th-accent/10 text-th-accent'
                        : 'border-th-border-subtle bg-th-overlay text-th-text-dim'
                    }`}
                    onFocus={() => setTestKeyActive(true)}
                    onBlur={() => { setTestKeyActive(false); invoke('release_keys').catch(() => {}); }}
                    onKeyDown={handleTestKeyDown}
                    onKeyUp={handleTestKeyUp}
                  >
                    {testKeyActive
                      ? (lastTestKey ? `Key: ${lastTestKey}` : 'Press any key...')
                      : 'Click here to start keyboard test'}
                  </div>
                </div>

                {/* Interactive mouse test */}
                <div>
                  <label className="block text-xs font-medium text-th-text-sub mb-2">Interactive Mouse Test</label>
                  <div
                    className={`h-28 rounded-lg border-2 relative overflow-hidden cursor-crosshair transition-all duration-200 ${
                      testMouseActive
                        ? 'border-th-accent bg-th-accent/5'
                        : 'border-th-border-subtle bg-th-overlay'
                    }`}
                    onMouseEnter={() => setTestMouseActive(true)}
                    onMouseLeave={() => setTestMouseActive(false)}
                    onMouseMove={handleTestMouseMove_interactive}
                    onClick={handleTestMouseClick_interactive}
                    onContextMenu={(e) => { e.preventDefault(); handleTestMouseClick_interactive(e as any); }}
                  >
                    {testMouseActive ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs text-th-accent font-mono">
                          ({mouseTestPos.x}, {mouseTestPos.y})
                        </span>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-th-text-dim">
                        Move into this area to test mouse movement and click
                      </div>
                    )}
                    {/* Grid lines */}
                    <div className="absolute inset-0 pointer-events-none" style={{
                      backgroundImage: 'linear-gradient(var(--th-border) 1px, transparent 1px), linear-gradient(90deg, var(--th-border) 1px, transparent 1px)',
                      backgroundSize: '25% 25%',
                      opacity: 0.3,
                    }} />
                  </div>
                </div>

                <div className="border-t border-th-border" />

                {/* Test log */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-th-text-sub">Test Log</label>
                    <button className="text-[10px] text-th-text-dim hover:text-th-text" onClick={() => setTestLog([])}>Clear</button>
                  </div>
                  <div className="h-32 overflow-y-auto rounded-lg bg-th-base border border-th-border-subtle p-2 font-mono text-[11px] text-th-text-sub space-y-0.5">
                    {testLog.length === 0 ? (
                      <div className="text-th-text-dim">Click buttons above or use interactive areas to start testing...</div>
                    ) : (
                      testLog.map((log, i) => <div key={i}>{log}</div>)
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-th-border">
          <button
            className="btn-ghost border border-th-border"
            onClick={handleReset}
          >
            Reset
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
