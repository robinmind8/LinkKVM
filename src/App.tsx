import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import VideoCanvas from './components/VideoCanvas';
import StatusBar from './components/StatusBar';
import Toolbar from './components/Toolbar';
import SettingsPanel from './components/SettingsPanel';
import QuickActions from './components/QuickActions';
import PermissionDialog from './components/PermissionDialog';
import LogPanel from './components/LogPanel';
import { useConfig } from './hooks/useConfig';
import { useAnalytics } from './hooks/useAnalytics';
import { ThemeProvider } from './contexts/ThemeContext';
import { log } from './stores/eventLog';

function AppContent() {
  const [controlMode, setControlMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogPanel, setShowLogPanel] = useState(true);
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [videoUrl, setVideoUrl] = useState('');
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialDetail, setSerialDetail] = useState('');
  const [videoRunning, setVideoRunning] = useState(false);
  const { config, configLoaded, updateConfig } = useConfig();
  const analytics = useAnalytics();
  const autoConnectDone = useRef(false);

  // Auto-connect serial and video on startup (based on saved config)
  useEffect(() => {
    if (!configLoaded || !permissionsChecked || autoConnectDone.current) return;
    autoConnectDone.current = true;

    const autoStart = async () => {
      // Auto-connect serial
      if (config.serial.port) {
        try {
          log.info('serial', `Auto-connecting serial ${config.serial.port} @ ${config.serial.baud_rate}bps...`);
          const probeResult = await invoke<string>('connect_serial', {
            port: config.serial.port,
            baudRate: config.serial.baud_rate,
          });
          setSerialConnected(true);
          setSerialDetail(`${config.serial.port} @ ${config.serial.baud_rate}bps`);
          log.info('serial', `Serial auto-connected: ${config.serial.port}`);
          log.info('serial', `CH9329 probe: ${probeResult}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log.warn('serial', `Serial auto-connect failed: ${msg}`);
          console.warn('Auto-connect serial failed:', e);
        }
      }

      // Auto-start video
      try {
        const result = await invoke<{ url: string; width: number; height: number }>('start_video', {
          deviceIndex: config.video.device_index,
        });
        setVideoUrl(result.url);
        setVideoRunning(true);
        // Auto-sync mouse resolution to video capture resolution
        if (result.width && result.height) {
          updateConfig({
            ...config,
            mouse: { ...config.mouse, screen_w: result.width, screen_h: result.height },
          });
          log.info('video', `Video started: ${result.width}x${result.height}`);
        }
        console.log('Auto-started video:', result.url, `${result.width}x${result.height}`);
      } catch (e) {
        console.warn('Auto-start video failed:', e);
      }
    };

    autoStart();
  }, [configLoaded, permissionsChecked, config]);

  const handleEnterControl = useCallback(() => {
    setControlMode(true);
    analytics.trackControlModeEntered();
  }, [analytics]);

  const handleExitControl = useCallback(() => {
    setControlMode(false);
    analytics.trackControlModeExited();
  }, [analytics]);

  const handleVideoStarted = useCallback((url: string, width?: number, height?: number) => {
    setVideoUrl(url);
    setVideoRunning(true);
    if (width && height) {
      updateConfig({
        ...config,
        mouse: { ...config.mouse, screen_w: width, screen_h: height },
      });
    }
    analytics.trackVideoStarted(config.video.device_index);
  }, [analytics, config, updateConfig]);

  const handleVideoStopped = useCallback(() => {
    setVideoUrl('');
    setVideoRunning(false);
    analytics.trackVideoStopped();
  }, [analytics]);

  const handleSerialConnected = useCallback((detail: string) => {
    setSerialConnected(true);
    setSerialDetail(detail);
    analytics.trackSerialConnected(config.serial.port, config.serial.baud_rate);
  }, [analytics, config.serial.port, config.serial.baud_rate]);

  const handleSerialDisconnected = useCallback(() => {
    setSerialConnected(false);
    setSerialDetail('');
    analytics.trackSerialDisconnected();
  }, [analytics]);

  return (
    <ThemeProvider configTheme={config.ui.theme}>
      <div className="flex flex-col h-screen bg-th-base text-th-text select-none transition-colors duration-300">
        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Video area */}
          <div className="flex-1 relative">
            <VideoCanvas
              videoUrl={videoUrl}
              controlMode={controlMode}
              onEnterControl={handleEnterControl}
              onExitControl={handleExitControl}
              screenWidth={config.mouse.screen_w}
              screenHeight={config.mouse.screen_h}
              mouseMode={config.mouse.mode}
              sensitivity={config.mouse.sensitivity}
              videoRunning={videoRunning}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>

          {/* Side panel */}
          {showSidePanel && (
            <div className="w-56 bg-th-surface border-l border-th-border flex flex-col transition-colors duration-300">
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                <Toolbar
                  onToggleSettings={() => setShowSettings(true)}
                  onToggleSidePanel={() => setShowSidePanel(false)}
                  onStartVideo={handleVideoStarted}
                  onStopVideo={handleVideoStopped}
                  videoRunning={videoRunning}
                  deviceIndex={config.video.device_index}
                />
                <div className="border-t border-th-border-subtle" />
                <QuickActions serialConnected={serialConnected} />
              </div>
            </div>
          )}

          {!showSidePanel && (
            <button
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-th-surface/90 backdrop-blur-sm border border-th-border hover:bg-th-overlay text-th-text-sub hover:text-th-text transition-all duration-200 z-10 shadow-lg"
              onClick={() => setShowSidePanel(true)}
              title="Show Panel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
        </div>

        {/* Log panel */}
        {showLogPanel && (
          <LogPanel onClose={() => setShowLogPanel(false)} />
        )}

        {/* Status bar */}
        {config.ui.show_status_bar && (
          <StatusBar
            serialConnected={serialConnected}
            serialDetail={serialDetail}
            videoRunning={videoRunning}
            controlMode={controlMode}
            showLogPanel={showLogPanel}
            onToggleLogPanel={() => setShowLogPanel((v) => !v)}
          />
        )}

        {/* Settings modal */}
        {showSettings && (
          <SettingsPanel
            config={config}
            onClose={() => setShowSettings(false)}
            onSave={updateConfig}
            onSerialConnected={handleSerialConnected}
            onSerialDisconnected={handleSerialDisconnected}
            onSettingsOpened={analytics.trackSettingsOpened}
            onConfigSaved={analytics.trackConfigSaved}
          />
        )}

        {/* Permission dialog on startup */}
        {!permissionsChecked && (
          <PermissionDialog onAllGranted={() => setPermissionsChecked(true)} />
        )}
      </div>
    </ThemeProvider>
  );
}

function App() {
  return <AppContent />;
}

export default App;
