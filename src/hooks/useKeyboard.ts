import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mapKeyToHID } from '../utils/keymap';
import { log } from '../stores/eventLog';

export function useKeyboard(
  containerRef: React.RefObject<HTMLDivElement | null>,
  controlMode: boolean,
  onExitControl: () => void
) {
  // Track currently pressed keycodes to avoid releasing all keys on keyup
  const pressedKeysRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !controlMode) return;

    const pressedKeys = pressedKeysRef.current;

    const buildModifier = (e: KeyboardEvent): number => {
      let modifier = 0;
      if (e.ctrlKey) modifier |= e.location === 2 ? 0x10 : 0x01;
      if (e.shiftKey) modifier |= e.location === 2 ? 0x20 : 0x02;
      if (e.altKey) modifier |= e.location === 2 ? 0x40 : 0x04;
      if (e.metaKey) modifier |= e.location === 2 ? 0x80 : 0x08;
      return modifier;
    };

    log.info('keyboard', 'Keyboard control activated');

    const sendCurrentState = async (modifier: number) => {
      const keycodes = Array.from(pressedKeys).slice(0, 6);
      try {
        await invoke('send_key', { modifier, keycodes });
      } catch (err: any) {
        log.warn('keyboard', `send_key failed: ${err}`);
      }
    };

    const handleKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const { modifier, keycode } = mapKeyToHID(e);
      if (keycode > 0) {
        pressedKeys.add(keycode);
      }
      log.debug('keyboard', `Pressed ${e.code} → HID 0x${keycode.toString(16).padStart(2, '0')} mod=0x${modifier.toString(16).padStart(2, '0')}`);
      // Modifier-only press also needs to be sent (modifier changed)
      if (keycode === 0 && modifier === 0) return;

      await sendCurrentState(modifier);
    };

    const handleKeyUp = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const { keycode } = mapKeyToHID(e);
      if (keycode > 0) {
        pressedKeys.delete(keycode);
      }

      // Use current event's modifier state (they may have been released after keyup)
      const modifier = buildModifier(e);

      if (pressedKeys.size === 0 && modifier === 0) {
        // All keys released, send full release packet
        try {
          await invoke('release_keys');
        } catch (err) {
          console.error('release_keys error:', err);
        }
      } else {
        // Other keys still pressed, send remaining key state
        await sendCurrentState(modifier);
      }
    };

    // Release all keys when window loses focus to prevent stuck keys
    const handleBlur = async () => {
      pressedKeys.clear();
      try {
        await invoke('release_keys');
      } catch (err) {
        console.error('release_keys error:', err);
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    el.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      el.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      // Release all keys on cleanup
      pressedKeys.clear();
      invoke('release_keys').catch(() => {});
      log.info('keyboard', 'Keyboard control stopped');
    };
  }, [containerRef, controlMode, onExitControl]);
}
