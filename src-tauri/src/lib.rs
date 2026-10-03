pub mod barcode;
pub mod commands;
pub mod excel;
pub mod model;
pub mod readers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_workbook,
            commands::read_sheet,
            commands::render_preview,
            commands::generate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
