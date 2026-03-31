/**
 * Convert pixel position within the video canvas to screen coordinates
 * on the controlled machine.
 *
 * The video canvas may be a different size than the actual screen resolution,
 * so we need to map the canvas-relative position to the screen coordinates.
 */
export function pixelToScreen(
  canvasX: number,
  canvasY: number,
  canvasWidth: number,
  canvasHeight: number,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  // Map canvas coordinates to screen coordinates
  const x = (canvasX / canvasWidth) * screenWidth;
  const y = (canvasY / canvasHeight) * screenHeight;

  return {
    x: Math.max(0, Math.min(screenWidth, x)),
    y: Math.max(0, Math.min(screenHeight, y)),
  };
}

/**
 * Convert screen pixel coordinates to CH9329 absolute coordinates (0-4095)
 */
export function screenToCh9329(
  screenX: number,
  screenY: number,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  const x = Math.round((screenX / screenWidth) * 4095);
  const y = Math.round((screenY / screenHeight) * 4095);

  return {
    x: Math.max(0, Math.min(4095, x)),
    y: Math.max(0, Math.min(4095, y)),
  };
}
