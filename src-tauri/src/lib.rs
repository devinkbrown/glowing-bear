use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(target_os = "linux")]
      {
        let win = app.get_webview_window("main")
          .expect("no main window");
        win.with_webview(|wv| {
          use webkit2gtk::{WebViewExt, SettingsExt};
          use webkit2gtk::glib::ObjectExt;
          let settings = wv.inner().settings().expect("no webview settings");
          // New Skia-based GPU canvas acceleration (WebKitGTK 2.46+)
          settings.set_property("enable-2d-canvas-acceleration", true);
          // Ensure hardware acceleration is always on
          settings.set_hardware_acceleration_policy(
            webkit2gtk::HardwareAccelerationPolicy::Always
          );
        })?;
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
