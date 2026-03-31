import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import { getEntries, subscribe, clearEntries, LogLevel, LogSource, LogEntry } from '../stores/eventLog';

function useEventLog() {
  return useSyncExternalStore(subscribe, getEntries, getEntries);
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: 'text-th-text-dim',
  INFO: 'text-blue-400',
  WARN: 'text-yellow-400',
};

const LEVEL_BG: Record<LogLevel, string> = {
  DEBUG: '',
  INFO: '',
  WARN: 'bg-yellow-900/10',
};

const SOURCE_COLORS: Record<LogSource, string> = {
  mouse: 'text-green-400',
  keyboard: 'text-purple-400',
  video: 'text-cyan-400',
  serial: 'text-orange-400',
  system: 'text-th-text-sub',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

const LEVELS: LogLevel[] = ['WARN', 'INFO', 'DEBUG'];

export default function LogPanel({ onClose }: { onClose: () => void }) {
  const entries = useEventLog();
  const [levelFilter, setLevelFilter] = useState<LogLevel>('DEBUG');
  const [sourceFilter, setSourceFilter] = useState<LogSource | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Determine visible log levels based on filter
  const visibleLevels = LEVELS.slice(0, LEVELS.indexOf(levelFilter) + 1);

  const filtered = entries.filter((e) => {
    if (!visibleLevels.includes(e.level)) return false;
    if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
    return true;
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(atBottom);
  }, []);

  return (
    <div className="bg-th-surface border-t border-th-border flex flex-col" style={{ height: 220 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-th-border-subtle text-[11px]">
        <span className="text-th-text-sub font-medium">Event Log</span>

        <div className="w-px h-3 bg-th-border" />

        {/* Level filter */}
        {LEVELS.map((lv) => (
          <button
            key={lv}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              levelFilter === lv
                ? 'bg-th-accent text-white'
                : visibleLevels.includes(lv)
                ? 'bg-th-overlay text-th-text'
                : 'text-th-text-dim hover:text-th-text'
            }`}
            onClick={() => setLevelFilter(lv)}
          >
            {lv}
          </button>
        ))}

        <div className="w-px h-3 bg-th-border" />

        {/* Source filter */}
        {(['all', 'mouse', 'keyboard', 'video', 'serial'] as const).map((src) => (
          <button
            key={src}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              sourceFilter === src
                ? 'bg-th-accent text-white'
                : 'text-th-text-dim hover:text-th-text'
            }`}
            onClick={() => setSourceFilter(src)}
          >
            {src === 'all' ? 'All' : src}
          </button>
        ))}

        <div className="flex-1" />

        {/* Count */}
        <span className="text-th-text-dim text-[10px] font-mono">
          {filtered.length}/{entries.length}
        </span>

        {/* Clear */}
        <button
          className="text-th-text-dim hover:text-th-danger text-[10px] transition-colors"
          onClick={clearEntries}
          title="Clear log"
        >
          Clear
        </button>

        {/* Close */}
        <button
          className="text-th-text-dim hover:text-th-text ml-1 transition-colors"
          onClick={onClose}
          title="Close log panel"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-[11px] leading-[18px]"
        onScroll={handleScroll}
      >
        {filtered.length === 0 ? (
          <div className="text-th-text-dim text-center py-6 text-[11px]">No logs yet</div>
        ) : (
          filtered.map((e) => (
            <LogLine key={e.id} entry={e} />
          ))
        )}
      </div>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div className={`flex gap-2 px-3 py-px hover:bg-th-overlay/30 ${LEVEL_BG[entry.level]}`}>
      <span className="text-th-text-dim shrink-0">{formatTime(entry.time)}</span>
      <span className={`shrink-0 w-11 text-right ${LEVEL_COLORS[entry.level]}`}>
        {entry.level}
      </span>
      <span className={`shrink-0 w-16 ${SOURCE_COLORS[entry.source]}`}>
        [{entry.source}]
      </span>
      <span className="text-th-text truncate">{entry.message}</span>
    </div>
  );
}
