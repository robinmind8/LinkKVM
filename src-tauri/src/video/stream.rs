use std::io::Write;
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

const BIND_ADDR: &str = "127.0.0.1:9527";
const BOUNDARY: &str = "frame";

/// Start local MJPEG HTTP stream server
pub fn start_mjpeg_server(
    frame_buffer: Arc<Mutex<Vec<u8>>>,
    running: Arc<AtomicBool>,
) -> Result<(), Box<dyn std::error::Error>> {
    let listener = {
        let socket = std::net::TcpListener::bind(BIND_ADDR)
            .or_else(|_| {
                std::thread::sleep(std::time::Duration::from_millis(500));
                std::net::TcpListener::bind(BIND_ADDR)
            })?;
        socket.set_nonblocking(true)?;
        socket
    };
    tracing::info!("MJPEG server listening on http://{}/video", BIND_ADDR);

    while running.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((stream, addr)) => {
                tracing::debug!("Client connected: {}", addr);
                let buffer = frame_buffer.clone();
                let running = running.clone();
                std::thread::spawn(move || {
                    handle_client(stream, buffer, running);
                });
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            Err(e) => {
                tracing::error!("Accept error: {}", e);
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
    }

    tracing::info!("MJPEG server stopped");
    Ok(())
}

fn handle_client(
    mut stream: std::net::TcpStream,
    buffer: Arc<Mutex<Vec<u8>>>,
    running: Arc<AtomicBool>,
) {
    if let Err(e) = stream.set_nonblocking(false) {
        tracing::error!("Failed to set blocking mode: {}", e);
        return;
    }

    // Keep-alive loop: handle multiple requests on the same connection
    loop {
        if !running.load(Ordering::Relaxed) {
            return;
        }

        // Read timeout for keep-alive idle connections
        if let Err(_) = stream.set_read_timeout(Some(std::time::Duration::from_secs(30))) {
            return;
        }

        let mut request_buf = [0u8; 2048];
        let n = match std::io::Read::read(&mut stream, &mut request_buf) {
            Ok(0) => return, // client closed
            Ok(n) => n,
            Err(_) => return, // timeout or error
        };

        let request = String::from_utf8_lossy(&request_buf[..n]);
        if !request.starts_with("GET") {
            let _ = stream.write_all(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n");
            return;
        }

        let path = request.split_whitespace().nth(1).unwrap_or("/");
        let base_path = path.split('?').next().unwrap_or(path);

        match base_path {
            "/snapshot" => {
                // Send one frame, keep connection alive for next request
                if !send_snapshot(&mut stream, &buffer) {
                    return; // write failed, client gone
                }
                // Continue loop to handle next request on same connection
            }
            "/video" => {
                // MJPEG continuous stream (never returns until done)
                handle_mjpeg_stream(&mut stream, buffer, running);
                return;
            }
            _ => {
                let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
                return;
            }
        }
    }
}

/// Send a single JPEG snapshot, return true if successful
fn send_snapshot(stream: &mut std::net::TcpStream, buffer: &Arc<Mutex<Vec<u8>>>) -> bool {
    let frame = {
        let buf = buffer.lock().unwrap();
        buf.clone()
    };

    if frame.is_empty() {
        let resp = "HTTP/1.1 204 No Content\r\nConnection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
        return stream.write_all(resp.as_bytes()).is_ok();
    }

    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: image/jpeg\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-cache, no-store\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: keep-alive\r\n\r\n",
        frame.len()
    );
    if stream.write_all(header.as_bytes()).is_err() {
        return false;
    }
    stream.write_all(&frame).is_ok()
}

/// MJPEG continuous stream
fn handle_mjpeg_stream(
    stream: &mut std::net::TcpStream,
    buffer: Arc<Mutex<Vec<u8>>>,
    running: Arc<AtomicBool>,
) {
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: multipart/x-mixed-replace; boundary={}\r\n\
         Cache-Control: no-cache, no-store, must-revalidate\r\n\
         Pragma: no-cache\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: keep-alive\r\n\r\n",
        BOUNDARY
    );
    if stream.write_all(header.as_bytes()).is_err() {
        return;
    }

    let frame_interval = std::time::Duration::from_millis(33);

    while running.load(Ordering::Relaxed) {
        let frame = {
            let buf = buffer.lock().unwrap();
            if buf.is_empty() {
                drop(buf);
                std::thread::sleep(frame_interval);
                continue;
            }
            buf.clone()
        };

        let part = format!(
            "--{}\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
            BOUNDARY,
            frame.len()
        );

        if stream.write_all(part.as_bytes()).is_err() { break; }
        if stream.write_all(&frame).is_err() { break; }
        if stream.write_all(b"\r\n").is_err() { break; }

        std::thread::sleep(frame_interval);
    }

    tracing::info!("MJPEG client disconnected");
}
