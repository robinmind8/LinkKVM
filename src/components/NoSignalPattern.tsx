interface NoSignalPatternProps {
  videoRunning: boolean;
}

export default function NoSignalPattern({ videoRunning }: NoSignalPatternProps) {
  // Classic SMPTE-like color bars
  const bars = [
    { color: '#c0c0c0', label: 'W' },
    { color: '#c0c000', label: 'Y' },
    { color: '#00c0c0', label: 'C' },
    { color: '#00c000', label: 'G' },
    { color: '#c000c0', label: 'M' },
    { color: '#c00000', label: 'R' },
    { color: '#0000c0', label: 'B' },
  ];

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Color bars area */}
      <div className="flex-1 flex">
        {bars.map((bar, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ backgroundColor: bar.color }}
          />
        ))}
      </div>

      {/* Bottom bar with gradient + text */}
      <div className="relative h-[15%] min-h-[40px]">
        {/* Sub-bars row */}
        <div className="absolute inset-0 flex">
          <div className="flex-1" style={{ backgroundColor: '#0000c0' }} />
          <div className="flex-1" style={{ backgroundColor: '#131313' }} />
          <div className="flex-1" style={{ backgroundColor: '#c000c0' }} />
          <div className="flex-1" style={{ backgroundColor: '#131313' }} />
          <div className="flex-1" style={{ backgroundColor: '#00c0c0' }} />
          <div className="flex-1" style={{ backgroundColor: '#131313' }} />
          <div className="flex-1" style={{ backgroundColor: '#c0c0c0' }} />
        </div>
      </div>

      {/* Center overlay message */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-8 py-5 text-center border border-white/10">
          <div className="flex items-center justify-center gap-2 mb-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className="text-white/90 font-semibold text-sm tracking-wide">NO SIGNAL</span>
          </div>
          <p className="text-white/50 text-xs">
            {videoRunning ? 'Capturing video, waiting for signal input...' : 'No video input — please start capture'}
          </p>
          {videoRunning && (
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400/80 text-[10px]">Waiting for signal</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
