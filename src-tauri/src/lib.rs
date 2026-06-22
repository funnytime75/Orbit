mod action;
mod config;
mod error;
mod state;

use action::execute_action as run_action;
use config::model::{ActionConfig, OrbitConfig};
use config::repository::{default_config, load_or_create_config, save_config as save_config_file};
use config::validation::validate_config as validate_orbit_config;
use error::{CommandError, CommandResult, OrbitError};
use state::{AppState, RuntimeStatus};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config_path = config_path(app.handle())?;
            let config = load_or_create_config(&config_path).unwrap_or_else(|error| {
                eprintln!("读取配置失败，已使用默认配置：{error}");
                default_config()
            });
            app.manage(AppState::new(config.clone(), config_path));

            #[cfg(desktop)]
            {
                apply_startup_window_policy(app.handle(), &config);
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    Some(vec!["--silent"]),
                ))?;
                if let Err(error) = sync_autostart(app.handle(), config.startup.launch_at_login) {
                    eprintln!("同步开机自启失败：{error}");
                }
                setup_tray(app.handle())?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            validate_config,
            get_runtime_status,
            execute_action
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
fn save_config(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    config: OrbitConfig,
) -> CommandResult<OrbitConfig> {
    validate_orbit_config(&config).map_err(CommandError::from)?;
    sync_autostart(&app, config.startup.launch_at_login).map_err(CommandError::from)?;
    save_config_file(&state.config_path, &config).map_err(CommandError::from)?;

    {
        let mut current_config = state.config.write().map_err(state_error)?;
        *current_config = config.clone();
    }

    {
        let mut runtime = state.runtime.write().map_err(state_error)?;
        runtime.enabled = config.enabled;
        runtime.config_loaded = true;
    }

    Ok(config)
}

#[tauri::command]
fn get_runtime_status(state: tauri::State<'_, AppState>) -> CommandResult<RuntimeStatus> {
    let mut runtime = state.runtime.read().map_err(state_error)?.clone();
    runtime.last_action_error = state.last_action_error.read().map_err(state_error)?.clone();

    Ok(runtime)
}

#[tauri::command]
fn execute_action(state: tauri::State<'_, AppState>, action: ActionConfig) -> CommandResult<()> {
    run_action(&action, &state.last_action_error).map_err(CommandError::from)
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, OrbitError> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("config.json"))
        .map_err(|error| OrbitError::ConfigIo(format!("获取配置目录失败：{error}")))
}

fn sync_autostart(app: &AppHandle, enabled: bool) -> Result<(), OrbitError> {
    let manager = app.autolaunch();
    if enabled {
        manager
            .enable()
            .map_err(|error| OrbitError::Autostart(error.to_string()))?;
    } else {
        let is_enabled = manager.is_enabled().unwrap_or(false);
        if is_enabled {
            manager
                .disable()
                .map_err(|error| OrbitError::Autostart(error.to_string()))?;
        }
    }

    Ok(())
}

fn setup_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let open_settings = MenuItem::with_id(app, "open_settings", "打开设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_settings, &quit])?;

    TrayIconBuilder::new()
        .tooltip("Orbit")
        .icon(app.default_window_icon().expect("缺少默认图标").clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open_settings" => {
                show_settings_window(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_settings_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn apply_startup_window_policy(app: &AppHandle, config: &OrbitConfig) {
    let silent_arg = std::env::args().any(|arg| arg == "--silent");
    if let Some(window) = app.get_webview_window("main") {
        if silent_arg && config.startup.silent_start {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn show_settings_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn state_error<T>(error: std::sync::PoisonError<T>) -> CommandError {
    CommandError::from(OrbitError::State(error.to_string()))
}
