import { useRef, useEffect, useState, useCallback } from 'react';
import { useKeyboard } from '../hooks/useKeyboard';
import { useMouse } from '../hooks/useMouse';
import { log } from '../stores/eventLog';
import NoSignalPattern from './NoSignalPattern';

interface VideoCanvasProps {
  videoUrl: string;
  controlMode: boolean;
  onEnterControl: () => void;
  onExitControl: () => void;
  screenWidth: number;
  screenHeight: number;
  mouseMode: string;
  sensitivity: number;
  videoRunning: boolean;
  onOpenSettings: () => void;
}

export default function VideoCanvas({
  videoUrl,
  controlMode,
  onEnterControl,
  onExitControl,
  screenWidth,
  screenHeight,
  mouseMode,
  sensitivity,
  videoRunning,
  onOpenSettings,
}: VideoCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  // Use refs for drag state to avoid stale closure issues
  const offsetRef = useRef({ x: 0, y: 0 });
  const sizeDeltaRef = useRef({ dw: 0, dh: 0 });
  const [renderKey, setRenderKey] = useState(0); // force re-render after drag
  const [isInteracting, setIsInteracting] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [streamStatus, setStreamStatus] = useState('');
  // Track if mouse actually moved during drag (to distinguish click vs drag)
  const didMoveRef = useRef(false);

  const dragState = useRef<{
    type: 'move' | 'resize';
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
    startDelta: { dw: number; dh: number };
    handle: string;
  } | null>(null);
  const interactTimer = useRef<ReturnType<typeof setTimeout>>();

  // Keyboard hook
  useKeyboard(containerRef, controlMode, onExitControl);

  // Mouse hook
  useMouse(containerRef, controlMode, screenWidth, screenHeight, mouseMode, sensitivity);

  // Optimized snapshot polling with keep-alive connection reuse
  useEffect(() => {
    setImgError(false);
    setStreamStatus('');
    offsetRef.current = { x: 0, y: 0 };
    sizeDeltaRef.current = { dw: 0, dh: 0 };
    setRenderKey(k => k + 1);

    if (!videoUrl) return;

    let active = true;
    let prevBlobUrl = '';
    let frameCount = 0;
    let fpsStart = performance.now();
    const baseUrl = videoUrl.substring(0, videoUrl.lastIndexOf('/'));
    const snapshotUrl = `${baseUrl}/snapshot`;

    const fetchLoop = async () => {
      let retryCount = 0;

      while (active) {
        try {
          const resp = await fetch(`${snapshotUrl}?_t=${Date.now()}`);
          if (!active) break;

          if (resp.status === 204) {
            // No frame yet, wait and retry
            setStreamStatus('Waiting for video frames...');
            await new Promise(r => setTimeout(r, 200));
            continue;
          }

          if (!resp.ok) {
            throw new Error(`Server error (HTTP ${resp.status})`);
          }

          const blob = await resp.blob();
          if (!active) break;

          if (blob.size < 2) {
            await new Promise(r => setTimeout(r, 100));
            continue;
          }

          const blobUrl = URL.createObjectURL(blob);
          if (imgRef.current) imgRef.current.src = blobUrl;
          if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl);
          prevBlobUrl = blobUrl;

          // Track FPS and detect stale frames
          frameCount++;
          const elapsed = performance.now() - fpsStart;
          if (elapsed >= 2000) {
            const fps = Math.round(frameCount / (elapsed / 1000));
            if (fps < 3) {
              setStreamStatus(`⚠ Low frame rate (${fps} fps), current resolution may not be supported`);
            } else {
              setStreamStatus(`${fps} fps`);
            }
            frameCount = 0;
            fpsStart = performance.now();
          }

          retryCount = 0;
          setImgError(false);
        } catch (err: any) {
          if (!active) break;
          retryCount++;
          const msg = err?.message || 'Video stream connection failed';
          setStreamStatus(`⚠ ${msg}, retrying (${retryCount})...`);
          setImgError(true);
          // Exponential backoff: 500ms, 1s, 2s, max 3s
          const delay = Math.min(500 * Math.pow(2, retryCount - 1), 3000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    };

    fetchLoop();

    return () => {
      active = false;
      if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl);
    };
  }, [videoUrl]);

  const setInteractingWithDelay = useCallback((active: boolean) => {
    if (interactTimer.current) clearTimeout(interactTimer.current);
    if (active) {
      setIsInteracting(true);
    } else {
      interactTimer.current = setTimeout(() => setIsInteracting(false), 600);
    }
  }, []);

  // Global mouse move/up handler — reads from refs, not state
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragState.current;
      if (!state) return;

      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;

      // Track real movement to distinguish click from drag
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didMoveRef.current = true;
      }

      if (state.type === 'move') {
        offsetRef.current = {
          x: state.startOffset.x + dx,
          y: state.startOffset.y + dy,
        };
        setRenderKey(k => k + 1);
      } else if (state.type === 'resize') {
        const el = containerRef.current;
        const containerW = el ? el.getBoundingClientRect().width : 800;
        const containerH = el ? el.getBoundingClientRect().height : 600;
        const MIN_SIZE = 120;
        let newDw = state.startDelta.dw;
        let newDh = state.startDelta.dh;
        let newX = state.startOffset.x;
        let newY = state.startOffset.y;

        if (state.handle.includes('r')) newDw = state.startDelta.dw + dx;
        if (state.handle.includes('b')) newDh = state.startDelta.dh + dy;
        if (state.handle.includes('l')) {
          const currentW = containerW + state.startDelta.dw - dx;
          if (currentW >= MIN_SIZE) {
            newDw = state.startDelta.dw - dx;
            newX = state.startOffset.x + dx;
          }
        }
        if (state.handle.includes('t')) {
          const currentH = containerH + state.startDelta.dh - dy;
          if (currentH >= MIN_SIZE) {
            newDh = state.startDelta.dh - dy;
            newY = state.startOffset.y + dy;
          }
        }

        // Enforce minimum
        if (containerW + newDw < MIN_SIZE) newDw = MIN_SIZE - containerW;
        if (containerH + newDh < MIN_SIZE) newDh = MIN_SIZE - containerH;

        offsetRef.current = { x: newX, y: newY };
        sizeDeltaRef.current = { dw: newDw, dh: newDh };
        setRenderKey(k => k + 1);
      }
    };

    const handleMouseUp = () => {
      if (dragState.current) {
        dragState.current = null;
        setInteractingWithDelay(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setInteractingWithDelay]);

  // Move start — reads refs directly
  const handleMoveStart = (e: React.MouseEvent) => {
    if (controlMode) return; // In control mode, mouse events go to target machine
    const target = e.target as HTMLElement;
    if (target.closest('[data-resize-handle]')) return;
    e.preventDefault();
    didMoveRef.current = false;
    dragState.current = {
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      startOffset: { ...offsetRef.current },
      startDelta: { ...sizeDeltaRef.current },
      handle: '',
    };
    setInteractingWithDelay(true);
  };

  // Resize start — reads refs directly
  const handleResizeStart = (e: React.MouseEvent, handle: string) => {
    if (controlMode) return; // In control mode, mouse events go to target machine
    e.preventDefault();
    e.stopPropagation();
    didMoveRef.current = false;
    dragState.current = {
      type: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      startOffset: { ...offsetRef.current },
      startDelta: { ...sizeDeltaRef.current },
      handle,
    };
    setInteractingWithDelay(true);
  };

  // Mouse enter/leave on the video frame for auto control mode
  const handleMouseEnter = () => {
    if (!controlMode && videoUrl) {
      log.info('system', 'Mouse entered video area, entering control mode');
      onEnterControl();
      containerRef.current?.focus();
    }
  };

  const handleMouseLeave = () => {
    if (controlMode && !dragState.current) {
      log.info('system', 'Mouse left video area, exiting control mode');
      onExitControl();
    }
  };

  // Double click to reset position/size (only when not in control mode)
  const handleDoubleClick = () => {
    if (controlMode) return; // In control mode, clicks go to target machine
    offsetRef.current = { x: 0, y: 0 };
    sizeDeltaRef.current = { dw: 0, dh: 0 };
    setRenderKey(k => k + 1);
  };

  // Prevent context menu in control mode
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventMenu = (e: MouseEvent) => {
      if (controlMode) e.preventDefault();
    };
    el.addEventListener('contextmenu', preventMenu);
    return () => el.removeEventListener('contextmenu', preventMenu);
  }, [controlMode]);

  // Resize handles
  const resizeHandles = [
    { pos: '-top-2 -left-2 cursor-nw-resize', handle: 'tl' },
    { pos: '-top-2 -right-2 cursor-ne-resize', handle: 'tr' },
    { pos: '-bottom-2 -left-2 cursor-sw-resize', handle: 'bl' },
    { pos: '-bottom-2 -right-2 cursor-se-resize', handle: 'br' },
    { pos: '-top-1.5 left-1/2 -translate-x-1/2 cursor-n-resize', handle: 't' },
    { pos: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-s-resize', handle: 'b' },
    { pos: '-left-1.5 top-1/2 -translate-y-1/2 cursor-w-resize', handle: 'l' },
    { pos: '-right-1.5 top-1/2 -translate-y-1/2 cursor-e-resize', handle: 'r' },
  ];

  const borderColor = isInteracting ? '#22c55e' : '#ef4444';
  const dotColor = isInteracting ? '#4ade80' : '#f87171';

  const { x: ox, y: oy } = offsetRef.current;
  const { dw, dh } = sizeDeltaRef.current;

  const frameStyle: React.CSSProperties = {
    position: 'absolute',
    left: ox,
    top: oy,
    width: dw !== 0 ? `calc(100% + ${dw}px)` : '100%',
    height: dh !== 0 ? `calc(100% + ${dh}px)` : '100%',
    border: controlMode ? 'none' : `3px solid ${borderColor}`,
    transition: 'border-color 0.3s',
    cursor: controlMode ? 'none' : 'move',
  };

  return (
    <div
      ref={containerRef}
      className={`video-container ${controlMode ? 'cursor-none' : 'cursor-default'}`}
      tabIndex={0}
      style={{ outline: 'none' }}
      data-render={renderKey}
    >
      {videoUrl ? (
        <>
          {/* Draggable + resizable video frame */}
          <div
            style={frameStyle}
            onMouseDown={handleMoveStart}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Video frame — src updated by fetch polling loop */}
            <img
              ref={imgRef}
              alt="Remote Screen"
              draggable={false}
              className="w-full h-full object-contain"
              style={{
                pointerEvents: 'none',
                backgroundColor: '#111',
              }}
            />

            {/* Error overlay with clear message */}
            {imgError && (
              <div className="absolute inset-0">
                <NoSignalPattern videoRunning={videoRunning} />
              </div>
            )}

            {/* Stream status indicator */}
            {streamStatus && (
              <div className={`absolute bottom-2 right-2 z-10 text-xs px-2 py-1 rounded shadow-lg ${
                imgError
                  ? 'bg-red-900/90 text-red-200'
                  : 'bg-black/60 text-green-300'
              }`}>
                {streamStatus}
              </div>
            )}

            {/* Resize handles (hidden in control mode) */}
            {!controlMode && resizeHandles.map(({ pos, handle }) => (
              <div
                key={handle}
                data-resize-handle="true"
                className={`absolute ${pos} z-20`}
                style={{
                  width: handle.length === 2 ? 16 : (handle === 't' || handle === 'b' ? 40 : 16),
                  height: handle.length === 2 ? 16 : (handle === 'l' || handle === 'r' ? 40 : 16),
                }}
                onMouseDown={(e) => handleResizeStart(e, handle)}
              >
                <div
                  className="absolute rounded-full transition-colors duration-300"
                  style={{
                    inset: handle.length === 2 ? 2 : 4,
                    backgroundColor: dotColor,
                  }}
                />
              </div>
            ))}
          </div>

        </>
      ) : (
        <div className="absolute inset-0">
          <NoSignalPattern videoRunning={videoRunning} />
          {!videoRunning && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
              <button
                className="btn-secondary text-xs opacity-70 hover:opacity-100 transition-opacity"
                onClick={onOpenSettings}
              >
                Open Settings
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
