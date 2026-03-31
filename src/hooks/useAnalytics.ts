import { useCallback, useEffect, useRef } from 'react';
import { trackEvent } from '@aptabase/tauri';

/**
 * Analytics event tracking Hook
 *
 * Aptabase automatically collects the following info:
 * - OS and version
 * - App version
 * - Country/Region
 * - Language/Locale
 *
 * This Hook tracks user behavior events
 */
export function useAnalytics() {
  const tracked = useRef(false);

  // Track on first load (does not conflict with Rust-side app_started dedup)
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    trackEvent('ui_loaded', {
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      pixel_ratio: window.devicePixelRatio,
    });
  }, []);

  const trackSerialConnected = useCallback((port: string, baudRate: number) => {
    trackEvent('serial_connected', { port, baud_rate: baudRate });
  }, []);

  const trackSerialDisconnected = useCallback(() => {
    trackEvent('serial_disconnected');
  }, []);

  const trackVideoStarted = useCallback((deviceIndex: number) => {
    trackEvent('video_started', { device_index: deviceIndex });
  }, []);

  const trackVideoStopped = useCallback(() => {
    trackEvent('video_stopped');
  }, []);

  const trackControlModeEntered = useCallback(() => {
    trackEvent('control_mode_entered');
  }, []);

  const trackControlModeExited = useCallback(() => {
    trackEvent('control_mode_exited');
  }, []);

  const trackSettingsOpened = useCallback(() => {
    trackEvent('settings_opened');
  }, []);

  const trackConfigSaved = useCallback((section: string) => {
    trackEvent('config_saved', { section });
  }, []);

  return {
    trackSerialConnected,
    trackSerialDisconnected,
    trackVideoStarted,
    trackVideoStopped,
    trackControlModeEntered,
    trackControlModeExited,
    trackSettingsOpened,
    trackConfigSaved,
  };
}
