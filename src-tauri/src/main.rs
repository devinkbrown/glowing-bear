// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // DMA-BUF buffer transport crashes on some Mesa/Gallium drivers; disable it
  // while keeping GPU-accelerated compositing active via other paths
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  app_lib::run();
}
