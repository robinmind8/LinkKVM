interface StatusBarProps {
  serialConnected: boolean;
  serialDetail: string;
  videoRunning: boolean;
  controlMode: boolean;
  showLogPanel: boolean;
  onToggleLogPanel: () => void;
}

export default function StatusBar({
  serialConnected,
  serialDetail,
  videoRunning,
  controlMode,
  showLogPanel,
  onToggleLogPanel,
}: StatusBarProps) {
  return (
    <div className="h-7 bg-th-surface border-t border-th-border flex items-center px-3 text-[11px] text-th-text-sub gap-4 transition-colors duration-300">
      {/* Serial status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            serialConnected ? 'bg-th-success status-pulse' : 'bg-th-danger'
          }`}
        />
        <span>
          Serial: {serialConnected ? serialDetail : 'Not connected'}
        </span>
      </div>

      <div className="w-px h-3 bg-th-border" />

      {/* Video status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            videoRunning ? 'bg-th-success status-pulse' : 'bg-th-text-dim'
          }`}
        />
        <span>
          Video: {videoRunning ? 'Streaming' : 'Stopped'}
        </span>
      </div>

      <div className="w-px h-3 bg-th-border" />

      {/* Control mode */}
      <div className="flex items-center gap-1.5">
        {controlMode && (
          <span className="w-1.5 h-1.5 rounded-full bg-th-warning status-pulse" />
        )}
        <span className={controlMode ? 'text-th-warning' : ''}>
          Mode: {controlMode ? 'Controlling' : 'Observing'}
        </span>
      </div>

      <div className="w-px h-3 bg-th-border" />

      {/* Log panel toggle */}
      <button
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
          showLogPanel ? 'bg-th-accent/20 text-th-accent' : 'text-th-text-dim hover:text-th-text'
        }`}
        onClick={onToggleLogPanel}
        title={showLogPanel ? 'Close Log' : 'Open Log'}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Log
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      <span className="text-th-text-dim font-mono text-[10px]">LinkKVM v0.1.0</span>
    </div>
  );
}
