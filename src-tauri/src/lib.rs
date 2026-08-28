use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// 历史栈文件路径：AppData/<identifier>/versions.json（每用户独立，卸载不残留）
fn history_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    dir.join("versions.json")
}

#[tauri::command]
fn load_history(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let p = history_path(&app);
    match fs::read_to_string(&p) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
        // 文件不存在或损坏：返回空历史栈
        Err(_) => Ok(serde_json::json!({ "entries": [], "index": 0 })),
    }
}

#[tauri::command]
fn save_history(
    app: tauri::AppHandle,
    entries: serde_json::Value,
    index: usize,
) -> Result<(), String> {
    let p = history_path(&app);
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let payload = serde_json::json!({ "entries": entries, "index": index });
    fs::write(&p, serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![load_history, save_history])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
