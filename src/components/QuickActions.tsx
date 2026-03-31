import { invoke } from '@tauri-apps/api/core';

interface QuickActionsProps {
  serialConnected: boolean;
}

export default function QuickActions({ serialConnected }: QuickActionsProps) {
  // Keyboard shortcuts: send HID keycodes directly
  const sendCombo = async (modifier: number, keycode: number) => {
    if (!serialConnected) return;
    try {
      await invoke('send_key', { modifier, keycodes: keycode > 0 ? [keycode] : [] });
      await new Promise(r => setTimeout(r, 100));
      await invoke('release_keys');
    } catch (e) {
      console.error('Quick action error:', e);
    }
  };

  // Mouse click: uses raw relative to send directly, unaffected by mode
  const sendMouseClick = async (button: number) => {
    if (!serialConnected) return;
    try {
      await invoke('send_mouse_raw_rel', { dx: 0, dy: 0, buttons: button });
      await new Promise(r => setTimeout(r, 80));
      await invoke('send_mouse_raw_rel', { dx: 0, dy: 0, buttons: 0 });
    } catch (e) {
      console.error('Mouse click error:', e);
    }
  };

  // Mouse swipe: sends raw relative in steps
  const sendMouseSwipe = async (totalDx: number, totalDy: number) => {
    if (!serialConnected) return;
    try {
      const steps = 8;
      const stepX = Math.round(totalDx / steps);
      const stepY = Math.round(totalDy / steps);
      const clamp = (v: number) => Math.max(-127, Math.min(127, v));
      for (let i = 0; i < steps; i++) {
        await invoke('send_mouse_raw_rel', { dx: clamp(stepX), dy: clamp(stepY), buttons: 0 });
        await new Promise(r => setTimeout(r, 16));
      }
    } catch (e) {
      console.error('Mouse swipe error:', e);
    }
  };

  // Mouse positioning: zero-reset then move to specified position on primary screen
  const sendMouseToPosition = async (direction: 'center' | 'left' | 'right' | 'top' | 'bottom') => {
    if (!serialConnected) return;
    try {
      const config = await invoke<any>('get_config');
      const sw = config.mouse.screen_w || 1920;
      const sh = config.mouse.screen_h || 1080;
      let tx: number, ty: number;
      switch (direction) {
        case 'center': tx = sw / 2; ty = sh / 2; break;
        case 'left':   tx = 20;     ty = sh / 2; break;
        case 'right':  tx = sw - 20; ty = sh / 2; break;
        case 'top':    tx = sw / 2; ty = 20;      break;
        case 'bottom': tx = sw / 2; ty = sh - 20; break;
      }
      // Use dedicated positioning command: zero-reset + move to target, always based on primary screen
      await invoke('move_mouse_to_position', { targetX: tx, targetY: ty });
    } catch (e) {
      console.error('Mouse position error:', e);
    }
  };

  const btnBase = "text-center text-[11px] px-1.5 py-1.5 rounded-lg border transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed";
  const btnKey = `${btnBase} bg-th-base border-th-border-subtle text-th-text-sub hover:bg-th-overlay hover:text-th-text hover:border-th-border font-mono`;
  const btnMouse = `${btnBase} bg-th-base border-th-border-subtle text-th-text-sub hover:bg-th-accent/10 hover:text-th-accent hover:border-th-accent/40`;
  const btnPos = `${btnBase} bg-th-base border-th-border-subtle text-th-text-sub hover:bg-th-accent/10 hover:text-th-accent hover:border-th-accent/40`;
  const sectionTitle = "text-[11px] font-bold text-th-text tracking-wide px-1";

  return (
    <div className="space-y-3">
      {/* Keyboard shortcuts */}
      <div>
        <h3 className={sectionTitle}>Keyboard</h3>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <button className={btnKey} onClick={() => sendCombo(0x05, 0x4C)} disabled={!serialConnected} title="Ctrl+Alt+Del">C+A+Del</button>
          <button className={btnKey} onClick={() => sendCombo(0x00, 0x46)} disabled={!serialConnected} title="PrintScreen">PrtSc</button>
          <button className={btnKey} onClick={() => sendCombo(0x05, 0x3A)} disabled={!serialConnected} title="Ctrl+Alt+F1">C+A+F1</button>
          <button className={btnKey} onClick={() => sendCombo(0x05, 0x40)} disabled={!serialConnected} title="Ctrl+Alt+F7">C+A+F7</button>
          <button className={btnKey} onClick={() => sendCombo(0x08, 0x00)} disabled={!serialConnected} title="Win/Super">Win</button>
          <button className={btnKey} onClick={() => sendCombo(0x04, 0x2B)} disabled={!serialConnected} title="Alt+Tab">A+Tab</button>
          <button className={btnKey} onClick={() => sendCombo(0x04, 0x3D)} disabled={!serialConnected} title="Alt+F4">A+F4</button>
          <button className={btnKey} onClick={() => sendCombo(0x00, 0x29)} disabled={!serialConnected} title="Escape">Esc</button>
          <button className={btnKey} onClick={() => sendCombo(0x01, 0x06)} disabled={!serialConnected} title="Ctrl+C">C+C</button>
          <button className={btnKey} onClick={() => sendCombo(0x01, 0x19)} disabled={!serialConnected} title="Ctrl+V">C+V</button>
        </div>
      </div>

      <div className="border-t border-th-border-subtle" />

      {/* Mouse actions */}
      <div>
        <h3 className={sectionTitle}>Mouse</h3>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <button className={btnMouse} onClick={() => sendMouseClick(0x01)} disabled={!serialConnected} title="Left click">Left Click</button>
          <button className={btnMouse} onClick={() => sendMouseClick(0x02)} disabled={!serialConnected} title="Right click">Right Click</button>
          <button className={btnMouse} onClick={() => sendMouseSwipe(-300, 0)} disabled={!serialConnected} title="Swipe left">← Left</button>
          <button className={btnMouse} onClick={() => sendMouseSwipe(300, 0)} disabled={!serialConnected} title="Swipe right">Right →</button>
          <button className={btnMouse} onClick={() => sendMouseSwipe(0, -300)} disabled={!serialConnected} title="Swipe up">↑ Up</button>
          <button className={btnMouse} onClick={() => sendMouseSwipe(0, 300)} disabled={!serialConnected} title="Swipe down">Down ↓</button>
        </div>
      </div>

      <div className="border-t border-th-border-subtle" />

      {/* Mouse positioning (primary screen) */}
      <div>
        <h3 className={sectionTitle}>Mouse Position <span className="font-normal text-[10px] text-th-text-dim">Primary Screen</span></h3>
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          <div />
          <button className={btnPos} onClick={() => sendMouseToPosition('top')} disabled={!serialConnected} title="Move to top of primary screen">↑ Top</button>
          <div />
          <button className={btnPos} onClick={() => sendMouseToPosition('left')} disabled={!serialConnected} title="Move to left of primary screen">← Left</button>
          <button className={`${btnPos} !bg-th-accent/10 !border-th-accent/30 !text-th-accent font-medium`} onClick={() => sendMouseToPosition('center')} disabled={!serialConnected} title="Move to center of primary screen">Center</button>
          <button className={btnPos} onClick={() => sendMouseToPosition('right')} disabled={!serialConnected} title="Move to right of primary screen">Right →</button>
          <div />
          <button className={btnPos} onClick={() => sendMouseToPosition('bottom')} disabled={!serialConnected} title="Move to bottom of primary screen">↓ Bottom</button>
          <div />
        </div>
      </div>

      {!serialConnected && (
        <p className="text-[10px] text-th-text-dim text-center px-1">
          Available after serial connection
        </p>
      )}
    </div>
  );
}
