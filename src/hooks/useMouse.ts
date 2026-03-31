import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { log } from '../stores/eventLog';

export function useMouse(
  containerRef: React.RefObject<HTMLDivElement | null>,
  controlMode: boolean,
  screenWidth: number,
  screenHeight: number,
  mouseMode: string,
  sensitivity: number
) {
  const throttleRef = useRef(false);
  const moveCountRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !controlMode) return;

    log.info('mouse', `Mouse control activated (mode: ${mouseMode}, screen: ${screenWidth}x${screenHeight})`);
    moveCountRef.current = 0;

    const getMouseButtons = (e: MouseEvent): number => {
      let btns = 0;
      if (e.buttons & 1) btns |= 0x01; // left
      if (e.buttons & 2) btns |= 0x02; // right
      if (e.buttons & 4) btns |= 0x04; // middle
      return btns;
    };

    const handleMouseMove = async (e: MouseEvent) => {
      if (throttleRef.current) return;
      throttleRef.current = true;

      // Throttle to ~60 events/sec (CH9329 needs time to read response)
      setTimeout(() => {
        throttleRef.current = false;
      }, 16);

      const buttons = getMouseButtons(e);

      // Both modes use movementX/Y relative displacement, sent via CMD 0x05
      // absolute mode: 1:1 mapping, no sensitivity multiplier
      // relative mode: multiplied by sensitivity factor
      const mul = mouseMode === 'absolute' ? 1 : sensitivity;
      const dx = e.movementX * mul;
      const dy = e.movementY * mul;

      moveCountRef.current++;
      if (moveCountRef.current <= 5 || moveCountRef.current % 100 === 0) {
        log.debug('mouse', `Move #${moveCountRef.current} → dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)} btn=${buttons} (${mouseMode})`);
      }

      try {
        await invoke('send_mouse_move', { x: dx, y: dy, buttons });
      } catch (err: any) {
        log.warn('mouse', `send_mouse_move failed: ${err}`);
      }
    };

    const handleMouseDown = async (e: MouseEvent) => {
      e.preventDefault();
      const buttons = getMouseButtons(e);
      log.info('mouse', `Pressed buttons=0x${buttons.toString(16).padStart(2, '0')}`);
      try {
        await invoke('send_mouse_move', { x: 0, y: 0, buttons });
      } catch (err: any) {
        log.warn('mouse', `send_mouse_move failed: ${err}`);
      }
    };

    const handleMouseUp = async (e: MouseEvent) => {
      e.preventDefault();
      const buttons = getMouseButtons(e);
      log.debug('mouse', `Released buttons=0x${buttons.toString(16).padStart(2, '0')}`);
      try {
        await invoke('send_mouse_move', { x: 0, y: 0, buttons });
      } catch (err: any) {
        log.warn('mouse', `send_mouse_move failed: ${err}`);
      }
    };

    const handleWheel = async (e: WheelEvent) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -1;
      log.debug('mouse', `Scroll delta=${delta}`);

      try {
        await invoke('send_mouse_scroll', { delta });
      } catch (err: any) {
        log.warn('mouse', `send_mouse_scroll failed: ${err}`);
      }
    };

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('contextmenu', handleContextMenu);

    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('contextmenu', handleContextMenu);
      log.info('mouse', `Mouse control stopped (total ${moveCountRef.current} moves)`);
    };
  }, [containerRef, controlMode, screenWidth, screenHeight, mouseMode, sensitivity]);
}
