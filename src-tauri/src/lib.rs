mod commands;
mod config;
mod hid;
mod state;
mod video;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_aptabase::Builder::new("A-US-8420028614").build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::check_permissions,
            commands::request_camera_permission,
            commands::open_privacy_settings,
            commands::list_serial_ports,
            commands::connect_serial,
            commands::disconnect_serial,
            commands::test_serial_connection,
            commands::send_key,
            commands::release_keys,
            commands::send_mouse_move,
            commands::send_mouse_click,
            commands::send_mouse_scroll,
            commands::list_video_devices,
            commands::start_video,
            commands::stop_video,
            commands::get_config,
            commands::save_config,
            commands::get_serial_status,
            commands::get_video_status,
            commands::get_ch9329_version,
            commands::get_ch9329_config,
            commands::set_ch9329_config,
            commands::reset_ch9329_default,
            commands::calibrate_mouse,
            commands::send_mouse_raw_rel,
            commands::move_mouse_to_position,
        ])
        .build(tauri::generate_context!())
        .expect("error while building LinkKVM")
        .run(|_handler, _event| {});
}
