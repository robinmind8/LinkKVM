// Event log store — singleton, framework-agnostic
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN';
export type LogSource = 'mouse' | 'keyboard' | 'video' | 'serial' | 'system';

export interface LogEntry {
  id: number;
  time: number; // Date.now()
  level: LogLevel;
  source: LogSource;
  message: string;
}

type Listener = () => void;

const MAX_ENTRIES = 500;
let nextId = 1;
let entries: LogEntry[] = [];
const listeners = new Set<Listener>();

export function addLog(level: LogLevel, source: LogSource, message: string) {
  entries.push({ id: nextId++, time: Date.now(), level, source, message });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }
  listeners.forEach((fn) => fn());
}

export function getEntries(): LogEntry[] {
  return entries;
}

export function clearEntries() {
  entries = [];
  nextId = 1;
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Convenience loggers
export const log = {
  debug: (source: LogSource, msg: string) => addLog('DEBUG', source, msg),
  info: (source: LogSource, msg: string) => addLog('INFO', source, msg),
  warn: (source: LogSource, msg: string) => addLog('WARN', source, msg),
};
