use serde::Serialize;
use serialport::SerialPortType;
use std::io::{Read, Write};
use std::time::{Duration, Instant};

#[derive(Serialize, Clone)]
pub struct PortInfo {
    pub name: String,
    pub port_type: String,
}

/// Serial port wrapper: supports both standard serialport and macOS raw fd modes
enum Port {
    Standard(Box<dyn serialport::SerialPort>),
    #[cfg(target_os = "macos")]
    Raw(std::fs::File),
}

impl Write for Port {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match self {
            Port::Standard(p) => p.write(buf),
            #[cfg(target_os = "macos")]
            Port::Raw(f) => f.write(buf),
        }
    }
    fn flush(&mut self) -> std::io::Result<()> {
        match self {
            Port::Standard(p) => p.flush(),
            #[cfg(target_os = "macos")]
            Port::Raw(f) => f.flush(),
        }
    }
}

impl Read for Port {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self {
            Port::Standard(p) => p.read(buf),
            #[cfg(target_os = "macos")]
            Port::Raw(f) => f.read(buf),
        }
    }
}

pub struct SerialManager {
    port: Port,
    port_name: String,
    baud_rate: u32,
    /// CH9329 requires packet interval >= 3ms, record last write completion time
    last_write: Instant,
    /// Write counter (for debugging)
    write_count: u64,
}

impl SerialManager {
    /// List all available serial port devices
    pub fn list_ports() -> Result<Vec<PortInfo>, Box<dyn std::error::Error>> {
        let ports = serialport::available_ports()?;
        Ok(ports
            .into_iter()
            .map(|p| {
                let port_type = match &p.port_type {
                    SerialPortType::UsbPort(info) => {
                        format!("USB (VID:{:04X} PID:{:04X})", info.vid, info.pid)
                    }
                    SerialPortType::PciPort => "PCI".to_string(),
                    SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                    SerialPortType::Unknown => "Unknown".to_string(),
                };
                PortInfo {
                    name: p.port_name,
                    port_type,
                }
            })
            .collect())
    }

    /// Open serial port connection
    pub fn open(port_name: &str, baud_rate: u32) -> Result<Self, Box<dyn std::error::Error>> {
        let port = Self::open_port(port_name, baud_rate)?;

        tracing::info!("Opened serial port {} at {} baud", port_name, baud_rate);

        Ok(Self {
            port,
            port_name: port_name.to_string(),
            baud_rate,
            last_write: Instant::now(),
            write_count: 0,
        })
    }

    fn open_port(port_name: &str, baud_rate: u32) -> Result<Port, Box<dyn std::error::Error>> {
        // macOS: tty.* waits for DCD carrier signal, cu.* does not. USB serial should use cu.*
        #[cfg(target_os = "macos")]
        let port_name = &Self::prefer_cu_device(port_name);

        // Try standard open method (non-macOS or non-CH34x driver devices)
        let result = serialport::new(port_name, baud_rate)
            .timeout(Duration::from_millis(100))
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None)
            .open();

        match result {
            Ok(port) => {
                tracing::info!(
                    "Serial port opened via standard method at {} baud",
                    baud_rate
                );
                Ok(Port::Standard(port))
            }
            Err(e) => {
                tracing::warn!(
                    "Standard serial open failed: {}. Trying CH34x workaround...",
                    e
                );
                #[cfg(target_os = "macos")]
                {
                    return Self::open_macos_ch34x(port_name, baud_rate);
                }
                #[cfg(not(target_os = "macos"))]
                {
                    Err(Box::new(e))
                }
            }
        }
    }

    /// macOS: Convert /dev/tty.* to /dev/cu.* (avoid DCD blocking)
    #[cfg(target_os = "macos")]
    fn prefer_cu_device(port_name: &str) -> String {
        if port_name.starts_with("/dev/tty.") {
            let cu = port_name.replacen("/dev/tty.", "/dev/cu.", 1);
            if std::path::Path::new(&cu).exists() {
                tracing::info!("Using cu device: {} (instead of tty)", cu);
                return cu;
            }
        }
        port_name.to_string()
    }

    /// macOS CH34x dedicated open
    /// Strategy A: Use libc to directly open + tcsetattr (consistent with pyserial, verified)
    /// Strategy B: serialport crate open at 9600 + IOSSIOSPEED
    #[cfg(target_os = "macos")]
    fn open_macos_ch34x(
        port_name: &str,
        baud_rate: u32,
    ) -> Result<Port, Box<dyn std::error::Error>> {
        // Strategy A: Use libc to open directly, bypassing serialport crate's cfmakeraw
        // cfmakeraw modifies too many termios flags, CH34x DriverKit driver rejects non-9600 baud rates
        // pyserial uses a milder raw config, verified in test_serial.py
        match Self::open_raw_libc(port_name, baud_rate) {
            Ok(port) => return Ok(port),
            Err(e) => tracing::warn!("Strategy A (raw libc) failed: {}", e),
        }

        // Strategy B: serialport crate open at 9600 + IOSSIOSPEED speed up
        match Self::open_serialport_with_iossiospeed(port_name, baud_rate) {
            Ok(port) => return Ok(port),
            Err(e) => tracing::warn!("Strategy B (9600+IOSSIOSPEED) failed: {}", e),
        }

        Err(format!(
            "All serial open strategies failed for {} at {}",
            port_name, baud_rate
        )
        .into())
    }

    /// Strategy A: Use libc to directly open and configure serial port (consistent with Python/pyserial behavior)
    #[cfg(target_os = "macos")]
    fn open_raw_libc(port_name: &str, baud_rate: u32) -> Result<Port, Box<dyn std::error::Error>> {
        use std::ffi::CString;
        use std::os::unix::io::FromRawFd;

        let c_path = CString::new(port_name)?;
        let fd = unsafe {
            libc::open(
                c_path.as_ptr(),
                libc::O_RDWR | libc::O_NOCTTY | libc::O_NONBLOCK,
            )
        };
        if fd < 0 {
            return Err(format!(
                "open({}) failed: {}",
                port_name,
                std::io::Error::last_os_error()
            )
            .into());
        }

        // Clear O_NONBLOCK (use blocking I/O after opening)
        unsafe {
            let flags = libc::fcntl(fd, libc::F_GETFL);
            libc::fcntl(fd, libc::F_SETFL, flags & !libc::O_NONBLOCK);
        }

        // Configure termios (pyserial-style raw mode, not cfmakeraw)
        let configure_result = unsafe {
            let mut termios: libc::termios = std::mem::zeroed();
            if libc::tcgetattr(fd, &mut termios) != 0 {
                let err = std::io::Error::last_os_error();
                libc::close(fd);
                return Err(format!("tcgetattr failed: {}", err).into());
            }

            // Input: disable software flow control, character conversion
            termios.c_iflag &= !(libc::IXON
                | libc::IXOFF
                | libc::IXANY
                | libc::INLCR
                | libc::IGNCR
                | libc::ICRNL
                | libc::ISTRIP
                | libc::INPCK);
            // Output: disable output processing
            termios.c_oflag &= !libc::OPOST;
            // Control: 8N1, enable receiver, local mode
            termios.c_cflag &= !(libc::CSIZE | libc::PARENB | libc::CSTOPB);
            termios.c_cflag |= libc::CS8 | libc::CREAD | libc::CLOCAL;
            // Local: disable canonical mode and echo
            termios.c_lflag &=
                !(libc::ICANON | libc::ECHO | libc::ECHOE | libc::ISIG | libc::IEXTEN);
            // Read timeout: VMIN=0, VTIME=1 (100ms)
            termios.c_cc[libc::VMIN] = 0;
            termios.c_cc[libc::VTIME] = 1;

            // Set baud rate
            libc::cfsetspeed(&mut termios, baud_rate as libc::speed_t);

            if libc::tcsetattr(fd, libc::TCSANOW, &termios) != 0 {
                let err = std::io::Error::last_os_error();
                libc::close(fd);
                return Err(format!("tcsetattr at {} failed: {}", baud_rate, err).into());
            }

            // Verify baud rate
            let mut verify: libc::termios = std::mem::zeroed();
            libc::tcgetattr(fd, &mut verify);
            (verify.c_ispeed, verify.c_ospeed)
        };

        let (ispeed, ospeed) = configure_result;
        tracing::info!(
            "Raw libc open OK: {} at {} baud (verified: ispeed={}, ospeed={})",
            port_name,
            baud_rate,
            ispeed,
            ospeed
        );

        let file = unsafe { std::fs::File::from_raw_fd(fd) };
        Ok(Port::Raw(file))
    }

    /// Strategy B: serialport crate open at 9600 + IOSSIOSPEED to set target baud rate
    #[cfg(target_os = "macos")]
    fn open_serialport_with_iossiospeed(
        port_name: &str,
        baud_rate: u32,
    ) -> Result<Port, Box<dyn std::error::Error>> {
        let port = serialport::new(port_name, 9600)
            .timeout(Duration::from_millis(100))
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None)
            .open_native()
            .map_err(|e| format!("open_native({}) at 9600 failed: {}", port_name, e))?;

        tracing::info!("Opened {} at 9600 via serialport crate", port_name);

        if baud_rate == 9600 {
            return Ok(Port::Standard(Box::new(port)));
        }

        use std::os::unix::io::AsRawFd;
        const IOSSIOSPEED: libc::c_ulong = 0x80045402;
        let fd = port.as_raw_fd();
        let speed: libc::speed_t = baud_rate as libc::speed_t;
        let result = unsafe { libc::ioctl(fd, IOSSIOSPEED, &speed as *const libc::speed_t) };

        if result == 0 {
            tracing::info!("Set baud rate to {} via IOSSIOSPEED", baud_rate);
            Ok(Port::Standard(Box::new(port)))
        } else {
            let err = std::io::Error::last_os_error();
            tracing::warn!("IOSSIOSPEED failed: {}", err);
            Err(format!("IOSSIOSPEED {} failed: {}", baud_rate, err).into())
        }
    }

    /// Write data and read CH9329 response
    ///
    /// CH9329 protocol requires: after sending a frame, wait for chip response before sending the next
    /// If response is not read, CH9329's send buffer may overflow, causing subsequent commands to be ignored
    pub fn write(&mut self, data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        let elapsed = self.last_write.elapsed();
        let min_interval = Duration::from_millis(3);
        if elapsed < min_interval {
            std::thread::sleep(min_interval - elapsed);
        }

        self.port.write_all(data)?;
        self.port.flush()?;
        self.write_count += 1;

        // Log detailed info for first 5 writes
        if self.write_count <= 5 {
            let hex: String = data
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(" ");
            tracing::info!(
                "Serial write #{}: [{}] ({} bytes)",
                self.write_count,
                hex,
                data.len()
            );
        }

        // Read CH9329 response (required! otherwise response accumulation causes command failures)
        let resp = self.read_response();
        self.last_write = Instant::now();

        // Check response status
        match resp {
            Some(ref bytes) if bytes.len() >= 6 => {
                let status = bytes[5];
                if status != 0x00 {
                    let status_text = match status {
                        0x01 => "Timeout",
                        0x02 => "Invalid parameter",
                        0x03 => "Packet format error",
                        0x04 => "USB not connected",
                        0x05 => "Device busy",
                        _ => "Unknown error",
                    };
                    tracing::warn!("CH9329 returned error: 0x{:02X} ({})", status, status_text);
                }
                if self.write_count <= 5 {
                    let hex: String = bytes
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join(" ");
                    tracing::info!("Serial resp #{}: [{}]", self.write_count, hex);
                }
            }
            Some(ref bytes) if !bytes.is_empty() => {
                if self.write_count <= 10 {
                    let hex: String = bytes
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join(" ");
                    tracing::warn!(
                        "CH9329 incomplete response ({} bytes): [{}]",
                        bytes.len(),
                        hex
                    );
                }
            }
            _ => {
                if self.write_count <= 10 {
                    tracing::warn!("CH9329 no response (write #{})", self.write_count);
                }
            }
        }

        Ok(())
    }

    /// Read CH9329 response packet (non-blocking, waits up to 50ms)
    fn read_response(&mut self) -> Option<Vec<u8>> {
        let mut buf = [0u8; 64];
        let mut result = Vec::new();
        let deadline = Instant::now() + Duration::from_millis(50);

        while Instant::now() < deadline {
            match self.port.read(&mut buf) {
                Ok(0) => {
                    if !result.is_empty() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(2));
                }
                Ok(n) => {
                    result.extend_from_slice(&buf[..n]);
                    // Check if complete response is read
                    if result.len() >= 5 {
                        let expected_len = 5 + result[4] as usize + 1;
                        if result.len() >= expected_len {
                            break;
                        }
                    }
                }
                Err(_) => {
                    if !result.is_empty() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(2));
                }
            }
        }

        if result.is_empty() {
            None
        } else {
            Some(result)
        }
    }

    /// Read data from serial port
    #[allow(dead_code)]
    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize, Box<dyn std::error::Error>> {
        let n = self.port.read(buf)?;
        Ok(n)
    }

    /// Write directly to serial port (without reading response, used for CH9329 config commands)
    pub fn port_write_raw(&mut self, data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        self.port.write_all(data)?;
        self.port.flush()?;
        Ok(())
    }

    /// Read directly from serial port (for CH9329 config command responses)
    pub fn port_read_raw(&mut self, buf: &mut [u8]) -> Result<usize, Box<dyn std::error::Error>> {
        let n = self.port.read(buf)?;
        Ok(n)
    }

    /// Probe CH9329: send GET_PARA_CFG command and verify response
    pub fn probe_ch9329(&mut self) -> Result<String, Box<dyn std::error::Error>> {
        use crate::hid::ch9329::Ch9329;

        // Clear receive buffer
        let mut discard = [0u8; 256];
        let _ = self.port.read(&mut discard);

        let cmd = Ch9329::build_get_para_cfg_packet();
        self.port.write_all(&cmd)?;
        self.port.flush()?;

        // Wait for response
        std::thread::sleep(Duration::from_millis(100));

        let mut buf = [0u8; 128];
        let n = self.port.read(&mut buf)?;

        if n >= 6 && buf[0] == 0x57 && buf[1] == 0xAB {
            let hex: String = buf[..n]
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(" ");
            let msg = format!("CH9329 responded ({} bytes): {}", n, hex);
            tracing::info!("{}", msg);
            Ok(msg)
        } else if n > 0 {
            let hex: String = buf[..n]
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(" ");
            Err(format!("Invalid response ({} bytes): {} - check baud rate", n, hex).into())
        } else {
            Err("No response from CH9329 - check port and baud rate".into())
        }
    }

    pub fn port_name(&self) -> &str {
        &self.port_name
    }

    pub fn baud_rate(&self) -> u32 {
        self.baud_rate
    }
}
