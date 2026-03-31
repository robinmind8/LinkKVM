import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
  serial: {
    port: string;
    baud_rate: number;
    auto_detect: boolean;
  };
  video: {
    device_index: number;
    resolution_w: number;
    resolution_h: number;
    fps: number;
    format: string;
    use_preset: boolean;
    preset: string;
    use_buffering: boolean;
  };
  mouse: {
    mode: string;
    screen_w: number;
    screen_h: number;
    sensitivity: number;
  };
  ui: {
    window_width: number;
    window_height: number;
    show_fps: boolean;
    show_status_bar: boolean;
    theme: string;
  };
}

const defaultConfig: AppConfig = {
  serial: {
    port: '',
    baud_rate: 115200,
    auto_detect: true,
  },
  video: {
    device_index: 0,
    resolution_w: 1920,
    resolution_h: 1080,
    fps: 30,
    format: 'MJPEG',
    use_preset: true,
    preset: 'high',
    use_buffering: false,
  },
  mouse: {
    mode: 'absolute',
    screen_w: 1920,
    screen_h: 1080,
    sensitivity: 1.0,
  },
  ui: {
    window_width: 1280,
    window_height: 720,
    show_fps: true,
    show_status_bar: true,
    theme: 'auto',
  },
};

export function useConfig() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    invoke<AppConfig>('get_config')
      .then((c) => {
        setConfig(c);
        setConfigLoaded(true);
      })
      .catch((e) => {
        console.error('Failed to load config:', e);
        setConfigLoaded(true);
      });
  }, []);

  const updateConfig = useCallback(async (newConfig: AppConfig) => {
    try {
      await invoke('save_config', { config: newConfig });
      setConfig(newConfig);
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }, []);

  return { config, configLoaded, updateConfig };
}
