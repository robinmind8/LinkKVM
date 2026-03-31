/// USB HID keycode constant definitions
///
/// Reference: USB HID Usage Tables - Keyboard/Keypad Page (0x07)

// Letter keys A-Z
pub const KEY_A: u8 = 0x04;
pub const KEY_B: u8 = 0x05;
pub const KEY_C: u8 = 0x06;
pub const KEY_D: u8 = 0x07;
pub const KEY_E: u8 = 0x08;
pub const KEY_F: u8 = 0x09;
pub const KEY_G: u8 = 0x0A;
pub const KEY_H: u8 = 0x0B;
pub const KEY_I: u8 = 0x0C;
pub const KEY_J: u8 = 0x0D;
pub const KEY_K: u8 = 0x0E;
pub const KEY_L: u8 = 0x0F;
pub const KEY_M: u8 = 0x10;
pub const KEY_N: u8 = 0x11;
pub const KEY_O: u8 = 0x12;
pub const KEY_P: u8 = 0x13;
pub const KEY_Q: u8 = 0x14;
pub const KEY_R: u8 = 0x15;
pub const KEY_S: u8 = 0x16;
pub const KEY_T: u8 = 0x17;
pub const KEY_U: u8 = 0x18;
pub const KEY_V: u8 = 0x19;
pub const KEY_W: u8 = 0x1A;
pub const KEY_X: u8 = 0x1B;
pub const KEY_Y: u8 = 0x1C;
pub const KEY_Z: u8 = 0x1D;

// Number keys 1-0
pub const KEY_1: u8 = 0x1E;
pub const KEY_2: u8 = 0x1F;
pub const KEY_3: u8 = 0x20;
pub const KEY_4: u8 = 0x21;
pub const KEY_5: u8 = 0x22;
pub const KEY_6: u8 = 0x23;
pub const KEY_7: u8 = 0x24;
pub const KEY_8: u8 = 0x25;
pub const KEY_9: u8 = 0x26;
pub const KEY_0: u8 = 0x27;

// Function keys
pub const KEY_ENTER: u8 = 0x28;
pub const KEY_ESCAPE: u8 = 0x29;
pub const KEY_BACKSPACE: u8 = 0x2A;
pub const KEY_TAB: u8 = 0x2B;
pub const KEY_SPACE: u8 = 0x2C;
pub const KEY_MINUS: u8 = 0x2D;
pub const KEY_EQUAL: u8 = 0x2E;
pub const KEY_BRACKET_LEFT: u8 = 0x2F;
pub const KEY_BRACKET_RIGHT: u8 = 0x30;
pub const KEY_BACKSLASH: u8 = 0x31;
pub const KEY_SEMICOLON: u8 = 0x33;
pub const KEY_QUOTE: u8 = 0x34;
pub const KEY_BACKQUOTE: u8 = 0x35;
pub const KEY_COMMA: u8 = 0x36;
pub const KEY_PERIOD: u8 = 0x37;
pub const KEY_SLASH: u8 = 0x38;
pub const KEY_CAPS_LOCK: u8 = 0x39;

// F1-F12
pub const KEY_F1: u8 = 0x3A;
pub const KEY_F2: u8 = 0x3B;
pub const KEY_F3: u8 = 0x3C;
pub const KEY_F4: u8 = 0x3D;
pub const KEY_F5: u8 = 0x3E;
pub const KEY_F6: u8 = 0x3F;
pub const KEY_F7: u8 = 0x40;
pub const KEY_F8: u8 = 0x41;
pub const KEY_F9: u8 = 0x42;
pub const KEY_F10: u8 = 0x43;
pub const KEY_F11: u8 = 0x44;
pub const KEY_F12: u8 = 0x45;

// Control keys
pub const KEY_PRINT_SCREEN: u8 = 0x46;
pub const KEY_SCROLL_LOCK: u8 = 0x47;
pub const KEY_PAUSE: u8 = 0x48;
pub const KEY_INSERT: u8 = 0x49;
pub const KEY_HOME: u8 = 0x4A;
pub const KEY_PAGE_UP: u8 = 0x4B;
pub const KEY_DELETE: u8 = 0x4C;
pub const KEY_END: u8 = 0x4D;
pub const KEY_PAGE_DOWN: u8 = 0x4E;

// Arrow keys
pub const KEY_ARROW_RIGHT: u8 = 0x4F;
pub const KEY_ARROW_LEFT: u8 = 0x50;
pub const KEY_ARROW_DOWN: u8 = 0x51;
pub const KEY_ARROW_UP: u8 = 0x52;

// Numpad
pub const KEY_NUM_LOCK: u8 = 0x53;
pub const KEY_NUMPAD_DIVIDE: u8 = 0x54;
pub const KEY_NUMPAD_MULTIPLY: u8 = 0x55;
pub const KEY_NUMPAD_SUBTRACT: u8 = 0x56;
pub const KEY_NUMPAD_ADD: u8 = 0x57;
pub const KEY_NUMPAD_ENTER: u8 = 0x58;
pub const KEY_NUMPAD_1: u8 = 0x59;
pub const KEY_NUMPAD_2: u8 = 0x5A;
pub const KEY_NUMPAD_3: u8 = 0x5B;
pub const KEY_NUMPAD_4: u8 = 0x5C;
pub const KEY_NUMPAD_5: u8 = 0x5D;
pub const KEY_NUMPAD_6: u8 = 0x5E;
pub const KEY_NUMPAD_7: u8 = 0x5F;
pub const KEY_NUMPAD_8: u8 = 0x60;
pub const KEY_NUMPAD_9: u8 = 0x61;
pub const KEY_NUMPAD_0: u8 = 0x62;
pub const KEY_NUMPAD_DECIMAL: u8 = 0x63;

// Modifier key bitfield
pub const MOD_LEFT_CTRL: u8 = 0x01;
pub const MOD_LEFT_SHIFT: u8 = 0x02;
pub const MOD_LEFT_ALT: u8 = 0x04;
pub const MOD_LEFT_META: u8 = 0x08;
pub const MOD_RIGHT_CTRL: u8 = 0x10;
pub const MOD_RIGHT_SHIFT: u8 = 0x20;
pub const MOD_RIGHT_ALT: u8 = 0x40;
pub const MOD_RIGHT_META: u8 = 0x80;

// Mouse button bitfield
pub const MOUSE_LEFT: u8 = 0x01;
pub const MOUSE_RIGHT: u8 = 0x02;
pub const MOUSE_MIDDLE: u8 = 0x04;
