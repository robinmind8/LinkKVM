/// CH9329 USB HID chip serial protocol encoder
///
/// Packet format:
/// [0x57] [0xAB] [addr] [cmd] [len] [data...] [checksum]
///
/// Checksum = sum of all bytes (mod 256)
pub struct Ch9329;

impl Ch9329 {
    const HEAD: [u8; 2] = [0x57, 0xAB];
    const ADDR: u8 = 0x00;

    // Command codes
    const CMD_KEYBOARD: u8 = 0x02;
    const CMD_MOUSE_ABS: u8 = 0x04;
    const CMD_MOUSE_REL: u8 = 0x05;

    /// Build keyboard HID packet
    ///
    /// modifier: modifier key bit field
    ///   bit0=LCtrl, bit1=LShift, bit2=LAlt, bit3=LMeta
    ///   bit4=RCtrl, bit5=RShift, bit6=RAlt, bit7=RMeta
    /// keys: simultaneously pressed keycodes (up to 6)
    pub fn build_keyboard_packet(modifier: u8, keys: &[u8]) -> Vec<u8> {
        let mut data = vec![modifier, 0x00]; // modifier + reserved
        for i in 0..6 {
            data.push(if i < keys.len() { keys[i] } else { 0x00 });
        }
        Self::build_packet(Self::CMD_KEYBOARD, &data)
    }

    /// Build absolute coordinate mouse packet
    ///
    /// x, y: 0-4095
    /// buttons: bit0=left, bit1=right, bit2=middle
    /// scroll: -127 ~ +127
    pub fn build_mouse_abs_packet(x: u16, y: u16, buttons: u8, scroll: i8) -> Vec<u8> {
        let data = vec![
            0x02, // Absolute coordinate flag
            buttons,
            (x & 0xFF) as u8,
            ((x >> 8) & 0xFF) as u8,
            (y & 0xFF) as u8,
            ((y >> 8) & 0xFF) as u8,
            scroll as u8,
        ];
        Self::build_packet(Self::CMD_MOUSE_ABS, &data)
    }

    /// Build relative coordinate mouse packet
    ///
    /// dx, dy: -127 ~ +127
    /// buttons: bit0=left, bit1=right, bit2=middle
    /// scroll: -127 ~ +127
    pub fn build_mouse_rel_packet(dx: i8, dy: i8, buttons: u8, scroll: i8) -> Vec<u8> {
        let data = vec![
            0x01, // Relative coordinate flag
            buttons,
            dx as u8,
            dy as u8,
            scroll as u8,
        ];
        Self::build_packet(Self::CMD_MOUSE_REL, &data)
    }

    /// Convert screen pixel coordinates to CH9329 absolute coordinates (0-4095)
    pub fn pixel_to_absolute(px: f64, py: f64, screen_w: u32, screen_h: u32) -> (u16, u16) {
        let x = ((px / screen_w as f64) * 4095.0).round() as u16;
        let y = ((py / screen_h as f64) * 4095.0).round() as u16;
        (x.min(4095), y.min(4095))
    }

    /// Build complete CH9329 packet (header + address + command + length + data + checksum)
    fn build_packet(cmd: u8, data: &[u8]) -> Vec<u8> {
        let len = data.len() as u8;
        let mut packet = Vec::with_capacity(5 + data.len() + 1);
        packet.extend_from_slice(&Self::HEAD);
        packet.push(Self::ADDR);
        packet.push(cmd);
        packet.push(len);
        packet.extend_from_slice(data);

        let checksum: u8 = packet.iter().fold(0u8, |acc, &b| acc.wrapping_add(b));
        packet.push(checksum);

        packet
    }

    /// Build GET_PARA_CFG command packet (used to probe if CH9329 is online)
    /// CMD = 0x08, no data
    pub fn build_get_para_cfg_packet() -> Vec<u8> {
        Self::build_packet(0x08, &[])
    }

    /// Build GET_VER command packet (CMD = 0x01)
    pub fn build_get_ver_packet() -> Vec<u8> {
        Self::build_packet(0x01, &[])
    }

    /// Build GET_INFO command packet (CMD = 0x06)
    pub fn build_get_info_packet() -> Vec<u8> {
        Self::build_packet(0x06, &[])
    }

    /// Build SET_PARA_CFG command packet (CMD = 0x09)
    /// config_data: 50 bytes of configuration data
    pub fn build_set_para_cfg_packet(config_data: &[u8]) -> Vec<u8> {
        Self::build_packet(0x09, config_data)
    }

    /// Build SET_DEFAULT_CFG command packet (CMD = 0x0E) — Restore factory defaults
    pub fn build_set_default_cfg_packet() -> Vec<u8> {
        Self::build_packet(0x0E, &[])
    }

    /// Build RESET command packet (CMD = 0x0F) — Software reset
    pub fn build_reset_packet() -> Vec<u8> {
        Self::build_packet(0x0F, &[])
    }

    /// Parse GET_PARA_CFG response into structured config
    pub fn parse_config(config_bytes: &[u8]) -> Ch9329Config {
        let b = |i: usize| -> u8 { config_bytes.get(i).copied().unwrap_or(0) };

        Ch9329Config {
            chip_mode: b(0) & 0x03,
            custom_string_enabled: (b(0) >> 7) & 0x01 == 1,
            usb_device_type: b(1) & 0x07,
            custom_vid_pid: (b(1) >> 7) & 0x01 == 1,
            serial_mode: b(3),
            baud_rate: ((b(4) as u32) << 16) | ((b(5) as u32) << 8) | (b(6) as u32),
            packet_interval: b(7),
            vid: (b(11) as u16) | ((b(12) as u16) << 8),
            pid: (b(13) as u16) | ((b(14) as u16) << 8),
            ascii_filter_mode: b(18),
            ascii_post_char: b(20),
            raw_bytes: config_bytes.to_vec(),
        }
    }

    /// Serialize structured config back to 50 bytes
    pub fn serialize_config(cfg: &Ch9329Config) -> Vec<u8> {
        let mut data = cfg.raw_bytes.clone();
        // Ensure 50 bytes
        data.resize(50, 0);

        // Write back modifiable fields
        data[0] = (data[0] & 0x7C) | (cfg.chip_mode & 0x03) | if cfg.custom_string_enabled { 0x80 } else { 0 };
        data[1] = (data[1] & 0x78) | (cfg.usb_device_type & 0x07) | if cfg.custom_vid_pid { 0x80 } else { 0 };
        data[3] = cfg.serial_mode;
        data[4] = ((cfg.baud_rate >> 16) & 0xFF) as u8;
        data[5] = ((cfg.baud_rate >> 8) & 0xFF) as u8;
        data[6] = (cfg.baud_rate & 0xFF) as u8;
        data[7] = cfg.packet_interval;
        data[11] = (cfg.vid & 0xFF) as u8;
        data[12] = ((cfg.vid >> 8) & 0xFF) as u8;
        data[13] = (cfg.pid & 0xFF) as u8;
        data[14] = ((cfg.pid >> 8) & 0xFF) as u8;
        data[18] = cfg.ascii_filter_mode;
        data[20] = cfg.ascii_post_char;

        data
    }
}

/// CH9329 chip configuration structure
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Ch9329Config {
    /// Chip working mode (0-3)
    /// 0 = Keyboard+Mouse+Custom HID, 1 = Keyboard+Mouse, 2 = Custom HID only, 3 = Keyboard only
    pub chip_mode: u8,
    /// Whether custom string descriptor is enabled
    pub custom_string_enabled: bool,
    /// USB device type (0-7)
    /// 0 = Standard, 1 = With absolute positioning support
    pub usb_device_type: u8,
    /// Whether custom VID/PID is enabled
    pub custom_vid_pid: bool,
    /// Serial communication mode (0=Protocol mode, 1=Passthrough mode)
    pub serial_mode: u8,
    /// Baud rate
    pub baud_rate: u32,
    /// Serial packet interval (ms)
    pub packet_interval: u8,
    /// USB VID
    pub vid: u16,
    /// USB PID
    pub pid: u16,
    /// ASCII character filter mode (0=No filter, 1=Filter)
    pub ascii_filter_mode: u8,
    /// ASCII post character (e.g. 0x0D = carriage return)
    pub ascii_post_char: u8,
    /// Raw configuration bytes (50 bytes)
    #[serde(skip)]
    pub raw_bytes: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyboard_packet_structure() {
        let packet = Ch9329::build_keyboard_packet(0x00, &[0x04]); // 'A' key
        assert_eq!(packet[0], 0x57);
        assert_eq!(packet[1], 0xAB);
        assert_eq!(packet[2], 0x00); // addr
        assert_eq!(packet[3], 0x02); // keyboard cmd
        assert_eq!(packet[4], 0x08); // data length = 8
        assert_eq!(packet[5], 0x00); // modifier = 0
        assert_eq!(packet[6], 0x00); // reserved
        assert_eq!(packet[7], 0x04); // key1 = 'A'
        assert_eq!(packet.len(), 14); // 5 header + 8 data + 1 checksum
    }

    #[test]
    fn test_keyboard_release() {
        let packet = Ch9329::build_keyboard_packet(0, &[]);
        assert_eq!(packet[3], 0x02);
        assert_eq!(packet[5], 0x00); // no modifier
        assert_eq!(packet[7], 0x00); // no key
    }

    #[test]
    fn test_keyboard_with_modifier() {
        // Ctrl + C
        let packet = Ch9329::build_keyboard_packet(0x01, &[0x06]);
        assert_eq!(packet[5], 0x01); // LCtrl
        assert_eq!(packet[7], 0x06); // 'C'
    }

    #[test]
    fn test_mouse_abs_packet() {
        let packet = Ch9329::build_mouse_abs_packet(2048, 2048, 0x01, 0);
        assert_eq!(packet[3], 0x04); // mouse abs cmd
        assert_eq!(packet[4], 0x07); // data length = 7
        assert_eq!(packet[5], 0x02); // abs mode flag
        assert_eq!(packet[6], 0x01); // left button
        assert_eq!(packet[7], 0x00); // x low = 2048 & 0xFF = 0
        assert_eq!(packet[8], 0x08); // x high = 2048 >> 8 = 8
    }

    #[test]
    fn test_mouse_rel_packet() {
        let packet = Ch9329::build_mouse_rel_packet(10, -5, 0x00, 0);
        assert_eq!(packet[3], 0x05); // mouse rel cmd
        assert_eq!(packet[4], 0x05); // data length = 5
        assert_eq!(packet[5], 0x01); // rel mode flag
        assert_eq!(packet[7], 10);   // dx
        assert_eq!(packet[8], (-5i8) as u8); // dy
    }

    #[test]
    fn test_pixel_to_absolute() {
        // Center of 1920x1080
        let (x, y) = Ch9329::pixel_to_absolute(960.0, 540.0, 1920, 1080);
        assert_eq!(x, 2048);
        assert_eq!(y, 2048);

        // Origin
        let (x, y) = Ch9329::pixel_to_absolute(0.0, 0.0, 1920, 1080);
        assert_eq!(x, 0);
        assert_eq!(y, 0);

        // Max
        let (x, y) = Ch9329::pixel_to_absolute(1920.0, 1080.0, 1920, 1080);
        assert_eq!(x, 4095);
        assert_eq!(y, 4095);
    }

    #[test]
    fn test_checksum() {
        let packet = Ch9329::build_keyboard_packet(0x00, &[]);
        let sum: u8 = packet[..packet.len() - 1]
            .iter()
            .fold(0u8, |acc, &b| acc.wrapping_add(b));
        assert_eq!(*packet.last().unwrap(), sum);
    }
}
