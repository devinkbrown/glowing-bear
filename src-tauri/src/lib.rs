use tauri::Manager;

mod credential_vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Single-instance must be registered first so a second-launch deep link
        // reaches the existing process before any other plugin handles it.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_window_state::Builder::default().build());
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            credential_vault::credential_vault_get,
            credential_vault::credential_vault_set,
            credential_vault::credential_vault_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DarkBear");
}
