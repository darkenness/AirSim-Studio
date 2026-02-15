use std::process::Command;

#[tauri::command]
fn run_engine(input: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let input_path = temp_dir.join("contam_input.json");
    let output_path = temp_dir.join("contam_output.json");

    // Write input JSON to temp file
    std::fs::write(&input_path, &input)
        .map_err(|e| format!("Failed to write input file: {}", e))?;

    // Find engine executable (look relative to app executable, then in PATH)
    let engine_path = find_engine_path();

    // Call engine CLI
    let result = Command::new(&engine_path)
        .arg("-i")
        .arg(&input_path)
        .arg("-o")
        .arg(&output_path)
        .arg("-v")
        .output()
        .map_err(|e| format!("Failed to run engine '{}': {}", engine_path, e))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let stdout = String::from_utf8_lossy(&result.stdout);
        return Err(format!("Engine failed (exit code {:?}):\n{}\n{}", 
            result.status.code(), stdout, stderr));
    }

    // Read output JSON
    let output = std::fs::read_to_string(&output_path)
        .map_err(|e| format!("Failed to read output file: {}", e))?;

    // Cleanup temp files
    let _ = std::fs::remove_file(&input_path);
    let _ = std::fs::remove_file(&output_path);

    Ok(output)
}

fn find_engine_path() -> String {
    // Try relative to current exe first
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidate = exe_dir.join("contam_engine.exe");
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
            // Also check parent directory (for dev builds)
            if let Some(parent) = exe_dir.parent() {
                let candidate = parent.join("contam_engine.exe");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }
    }
    // Fallback: assume it's in PATH or use hardcoded dev path
    "contam_engine".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![run_engine])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
