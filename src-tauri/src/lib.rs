mod action;
mod app_icon;
mod config;
mod error;
mod mouse_trigger;
mod shortcut;
mod state;

use action::execute_action as run_action;
use app_icon::load_app_icon_data_url;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use config::model::{ActionConfig, OrbitConfig};
use config::repository::{default_config, load_or_create_config, save_config as save_config_file};
use config::validation::validate_config as validate_orbit_config;
use error::{CommandError, CommandResult, OrbitError};
use mouse_trigger::{start_mouse_trigger, stop_mouse_trigger};
use shortcut::sync_trigger_shortcut;
use state::{AppState, RuntimeStatus};
use std::fs;
use std::path::Path;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::Color;
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

const MAX_BACKGROUND_IMAGE_BYTES: u64 = 8 * 1024 * 1024;

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
            app.manage(AppStateCleanup);

            #[cfg(desktop)]
            {
                apply_startup_window_policy(app.handle(), &config);
                apply_wheel_window_policy(app.handle());
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    Some(vec!["--silent"]),
                ))?;
                if let Err(error) = sync_autostart(app.handle(), config.startup.launch_at_login) {
                    eprintln!("同步开机自启失败：{error}");
                }
                if let Err(error) = sync_trigger_shortcut(app.handle(), &config.trigger.shortcut) {
                    eprintln!("同步触发快捷键失败：{error}");
                }
                if let Err(error) = start_mouse_trigger(app.handle()) {
                    eprintln!("启动鼠标触发监听失败：{error}");
                }
                setup_tray(app.handle())?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            execute_action,
            load_background_image,
            load_app_icon
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
    sync_trigger_shortcut(&app, &config.trigger.shortcut).map_err(CommandError::from)?;
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

#[tauri::command]
fn load_background_image(image_path: String) -> CommandResult<String> {
    let path = image_path.trim();
    if path.is_empty() {
        return Err(CommandError::from(OrbitError::BackgroundImage(
            "背景图片路径不能为空".to_string(),
        )));
    }

    let metadata = fs::metadata(path).map_err(|error| {
        CommandError::from(OrbitError::BackgroundImage(format!(
            "读取背景图片信息失败：{error}"
        )))
    })?;
    if metadata.len() > MAX_BACKGROUND_IMAGE_BYTES {
        return Err(CommandError::from(OrbitError::BackgroundImage(format!(
            "背景图片不能超过 {} MB",
            MAX_BACKGROUND_IMAGE_BYTES / 1024 / 1024
        ))));
    }

    let bytes = fs::read(path).map_err(|error| {
        CommandError::from(OrbitError::BackgroundImage(format!(
            "读取背景图片失败：{error}"
        )))
    })?;
    let mime = infer_background_image_mime(path, &bytes).ok_or_else(|| {
        CommandError::from(OrbitError::BackgroundImage(
            "背景图片只支持有效的 png、jpg、jpeg、webp 或 bmp 文件".to_string(),
        ))
    })?;
    let encoded = BASE64_STANDARD.encode(bytes);

    Ok(format!("data:{mime};base64,{encoded}"))
}

#[tauri::command]
fn load_app_icon(program: String) -> CommandResult<Option<String>> {
    load_app_icon_data_url(&program).map_err(CommandError::from)
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

impl Drop for AppStateCleanup {
    fn drop(&mut self) {
        stop_mouse_trigger();
    }
}

struct AppStateCleanup;

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

pub(crate) fn apply_wheel_window_policy(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("wheel") {
        make_wheel_window_transparent(&window);
    }
}

pub(crate) fn make_wheel_window_transparent(window: &WebviewWindow) {
    let _ = window.set_shadow(false);
    let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
}

fn state_error<T>(error: std::sync::PoisonError<T>) -> CommandError {
    CommandError::from(OrbitError::State(error.to_string()))
}

fn infer_background_image_mime(path: &str, bytes: &[u8]) -> Option<&'static str> {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)?;

    match extension.as_str() {
        "png" if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) => {
            Some("image/png")
        }
        "jpg" | "jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Some("image/jpeg"),
        "webp" if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" => {
            Some("image/webp")
        }
        "bmp" if bytes.starts_with(b"BM") => Some("image/bmp"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::infer_background_image_mime;

    #[test]
    fn accepts_supported_background_image_signature() {
        let bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 ";

        assert_eq!(
            infer_background_image_mime("C:\\Wallpapers\\orbit.webp", bytes),
            Some("image/webp")
        );
    }

    #[test]
    fn rejects_background_image_with_mismatched_signature() {
        let bytes = b"not really a png";

        assert_eq!(
            infer_background_image_mime("C:\\Wallpapers\\orbit.png", bytes),
            None
        );
    }
}
