mod config;
mod error;
mod state;

use config::model::OrbitConfig;
use config::repository::default_config;
use config::validation::validate_config as validate_orbit_config;
use error::{CommandError, CommandResult};
use state::{AppState, RuntimeStatus};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = default_config();

    tauri::Builder::default()
        .manage(AppState::new(config))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            validate_config,
            get_runtime_status
        ])
        .run(tauri::generate_context!())
        .expect("启动 Orbit 失败");
}

#[tauri::command]
fn load_config(state: tauri::State<'_, AppState>) -> CommandResult<OrbitConfig> {
    let config = state
        .config
        .read()
        .map_err(|error| CommandError {
            code: "STATE_LOCK_FAILED",
            message: "读取配置状态失败".to_string(),
            detail: error.to_string(),
        })?
        .clone();

    Ok(config)
}

#[tauri::command]
fn validate_config(config: OrbitConfig) -> CommandResult<OrbitConfig> {
    validate_orbit_config(&config).map_err(CommandError::from)?;
    Ok(config)
}

#[tauri::command]
fn get_runtime_status(state: tauri::State<'_, AppState>) -> CommandResult<RuntimeStatus> {
    let runtime = state
        .runtime
        .read()
        .map_err(|error| CommandError {
            code: "STATE_LOCK_FAILED",
            message: "读取运行状态失败".to_string(),
            detail: error.to_string(),
        })?
        .clone();

    Ok(runtime)
}
