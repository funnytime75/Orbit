use crate::config::model::{
    default_startup_config, default_ui_state, default_wheel_appearance, ActionConfig, IconConfig,
    MenuConfig, OrbitConfig, SectorConfig, ThemeMode, TriggerButton, TriggerConfig, WheelConfig,
};
use crate::config::validation::validate_config;
use crate::error::OrbitError;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn default_config() -> OrbitConfig {
    OrbitConfig {
        version: 1,
        enabled: true,
        startup: default_startup_config(),
        trigger: TriggerConfig {
            button: TriggerButton::Middle,
            hold_ms: 220,
            move_threshold_px: 18,
            cancel_distance_px: 14,
        },
        wheel: WheelConfig {
            size_px: 360,
            inner_radius_px: 42,
            outer_radius_px: 156,
            start_angle_deg: -90,
            animation_ms: 90,
            theme: ThemeMode::System,
            appearance: default_wheel_appearance(),
        },
        menus: vec![MenuConfig {
            id: "main".to_string(),
            label: "主菜单".to_string(),
            sectors: vec![
                SectorConfig {
                    id: "chrome".to_string(),
                    label: "Chrome".to_string(),
                    icon: IconConfig::Text {
                        value: "C".to_string(),
                    },
                    action: ActionConfig::App {
                        program: "chrome.exe".to_string(),
                        args: vec![],
                    },
                },
                SectorConfig {
                    id: "vscode".to_string(),
                    label: "VS Code".to_string(),
                    icon: IconConfig::Text {
                        value: "V".to_string(),
                    },
                    action: ActionConfig::App {
                        program: "Code.exe".to_string(),
                        args: vec![],
                    },
                },
                SectorConfig {
                    id: "notepad".to_string(),
                    label: "记事本".to_string(),
                    icon: IconConfig::Text {
                        value: "记".to_string(),
                    },
                    action: ActionConfig::App {
                        program: "notepad.exe".to_string(),
                        args: vec![],
                    },
                },
            ],
        }],
        ui_state: default_ui_state(),
    }
}

pub fn load_or_create_config(config_path: &Path) -> Result<OrbitConfig, OrbitError> {
    if config_path.exists() {
        let content = fs::read_to_string(config_path)
            .map_err(|error| OrbitError::ConfigIo(format!("读取配置失败：{error}")))?;
        let config = serde_json::from_str::<OrbitConfig>(&content)
            .map_err(|error| OrbitError::ConfigInvalid(format!("解析配置失败：{error}")))?;
        validate_config(&config)?;
        return Ok(config);
    }

    let config = default_config();
    save_config(config_path, &config)?;
    Ok(config)
}

pub fn save_config(config_path: &Path, config: &OrbitConfig) -> Result<(), OrbitError> {
    validate_config(config)?;

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| OrbitError::ConfigIo(format!("创建配置目录失败：{error}")))?;
    }

    let temp_path = temp_config_path(config_path);
    let content = serde_json::to_string_pretty(config)
        .map_err(|error| OrbitError::ConfigIo(format!("序列化配置失败：{error}")))?;
    write_temp_config(&temp_path, &content)?;
    replace_config_file(&temp_path, config_path)
        .map_err(|error| OrbitError::ConfigIo(format!("替换配置失败：{error}")))?;

    Ok(())
}

fn write_temp_config(temp_path: &Path, content: &str) -> Result<(), OrbitError> {
    let mut file = File::create(temp_path)
        .map_err(|error| OrbitError::ConfigIo(format!("写入临时配置失败：{error}")))?;
    file.write_all(content.as_bytes())
        .map_err(|error| OrbitError::ConfigIo(format!("写入临时配置失败：{error}")))?;
    file.sync_all()
        .map_err(|error| OrbitError::ConfigIo(format!("同步临时配置失败：{error}")))?;
    Ok(())
}

#[cfg(windows)]
fn replace_config_file(temp_path: &Path, config_path: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    fn to_wide(path: &Path) -> Vec<u16> {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let temp_wide = to_wide(temp_path);
    let config_wide = to_wide(config_path);
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;
    let moved = unsafe { MoveFileExW(temp_wide.as_ptr(), config_wide.as_ptr(), flags) };

    if moved == 0 {
        return Err(std::io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(not(windows))]
fn replace_config_file(temp_path: &Path, config_path: &Path) -> std::io::Result<()> {
    fs::rename(temp_path, config_path)
}

fn temp_config_path(config_path: &Path) -> PathBuf {
    let mut temp_path = config_path.to_path_buf();
    temp_path.set_extension("json.tmp");
    temp_path
}

#[cfg(test)]
mod tests {
    use super::{default_config, save_config};
    use crate::config::validation::validate_config;
    use std::fs;

    #[test]
    fn default_config_contains_startup_and_ui_state() {
        let config = default_config();

        assert!(!config.startup.launch_at_login);
        assert!(!config.startup.silent_start);
        assert!(config.ui_state.last_app_picker_dir.is_some());
    }

    #[test]
    fn save_config_rejects_invalid_config_without_writing() {
        let mut config = default_config();
        config.menus[0].sectors.clear();

        let path = std::env::temp_dir().join(format!(
            "orbit-invalid-{}.json",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("系统时间异常")
                .as_nanos()
        ));

        let error = save_config(&path, &config).expect_err("应该拒绝无效配置");

        assert!(error.to_string().contains("sectors"));
        assert!(!path.exists());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn save_config_replaces_existing_config() {
        let mut config = default_config();
        let path = std::env::temp_dir().join(format!(
            "orbit-replace-{}.json",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("系统时间异常")
                .as_nanos()
        ));

        save_config(&path, &config).expect("首次保存应该成功");
        config.enabled = false;
        save_config(&path, &config).expect("覆盖保存应该成功");

        let saved = fs::read_to_string(&path).expect("应该能读取配置文件");
        assert!(saved.contains("\"enabled\": false"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn default_config_is_valid() {
        let config = default_config();

        assert!(validate_config(&config).is_ok());
    }
}
