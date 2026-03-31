import { invoke } from '@tauri-apps/api/core';

interface ToolbarProps {
  onToggleSettings: () => void;
  onToggleSidePanel: () => void;
  onStartVideo: (url: string, width?: number, height?: number) => void;
  onStopVideo: () => void;
  videoRunning: boolean;
  deviceIndex: number;
}

export default function Toolbar({
  onToggleSettings,
  onToggleSidePanel,
  onStartVideo,
  onStopVideo,
  videoRunning,
  deviceIndex,
}: ToolbarProps) {
  const handleToggleVideo = async () => {
    try {
      if (videoRunning) {
        await invoke('stop_video');
        onStopVideo();
      } else {
        const result = await invoke<{ url: string; width: number; height: number }>('start_video', {
          deviceIndex,
        });
        onStartVideo(result.url, result.width, result.height);
      }
    } catch (e) {
      console.error('Video toggle error:', e);
    }
  };

  return (
    <div className="space-y-1.5">
      <h3 className="text-[10px] text-th-text-dim font-semibold uppercase tracking-widest px-1 mb-2">
        Toolbar
      </h3>

      <button
        className={`w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-lg transition-all duration-200 active:scale-[0.97] ${
          videoRunning
            ? 'bg-th-danger/15 text-th-danger hover:bg-th-danger/25 border border-th-danger/30'
            : 'bg-th-accent/10 text-th-accent hover:bg-th-accent/20 border border-th-accent/20'
        }`}
        onClick={handleToggleVideo}
      >
        {videoRunning ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>
        )}
        {videoRunning ? 'Stop Capture' : 'Start Capture'}
      </button>

      <button
        className="w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-lg text-th-text-sub hover:bg-th-overlay hover:text-th-text transition-all duration-200 active:scale-[0.97]"
        onClick={onToggleSettings}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        Settings
      </button>

      <button
        className="w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-lg text-th-text-sub hover:bg-th-overlay hover:text-th-text transition-all duration-200 active:scale-[0.97]"
        onClick={onToggleSidePanel}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
        Hide Panel
      </button>
    </div>
  );
}
