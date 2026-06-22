use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrbitConfig {
    pub version: u8,
    pub enabled: bool,
    #[serde(default = "default_startup_config")]
    pub startup: StartupConfig,
    pub trigger: TriggerConfig,
    pub wheel: WheelConfig,
    pub menus: Vec<MenuConfig>,
    #[serde(default = "default_ui_state")]
    pub ui_state: UiState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupConfig {
    pub launch_at_login: bool,
    pub silent_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiState {
    pub last_app_picker_dir: Option<String>,
}

pub fn default_startup_config() -> StartupConfig {
    StartupConfig {
        launch_at_login: false,
        silent_start: false,
    }
}

pub fn default_ui_state() -> UiState {
    UiState {
        last_app_picker_dir: default_app_picker_dir(),
    }
}

fn default_app_picker_dir() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        Some("C:\\Program Files".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerConfig {
    pub button: TriggerButton,
    pub hold_ms: u16,
    pub move_threshold_px: u16,
    pub cancel_distance_px: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TriggerButton {
    Middle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WheelConfig {
    pub size_px: u16,
    pub inner_radius_px: u16,
    pub outer_radius_px: u16,
    pub start_angle_deg: i16,
    pub animation_ms: u16,
    pub theme: ThemeMode,
    #[serde(default = "default_wheel_appearance")]
    pub appearance: WheelAppearanceConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WheelAppearanceConfig {
    pub material: WheelMaterial,
    pub opacity: f32,
    pub blur_px: u16,
    pub background_color: String,
    pub border_color: String,
    pub active_color: String,
    pub background: WheelBackgroundConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WheelMaterial {
    Transparent,
    Acrylic,
    Frosted,
    Solid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WheelBackgroundConfig {
    #[serde(rename = "type")]
    pub background_type: WheelBackgroundType,
    pub image_path: Option<String>,
    pub fit: WheelBackgroundFit,
    pub opacity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WheelBackgroundType {
    None,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WheelBackgroundFit {
    Cover,
    Contain,
}

pub fn default_wheel_appearance() -> WheelAppearanceConfig {
    WheelAppearanceConfig {
        material: WheelMaterial::Acrylic,
        opacity: 0.9,
        blur_px: 18,
        background_color: "#101827".to_string(),
        border_color: "#2b3d58".to_string(),
        active_color: "#2f6df6".to_string(),
        background: WheelBackgroundConfig {
            background_type: WheelBackgroundType::None,
            image_path: None,
            fit: WheelBackgroundFit::Cover,
            opacity: 0.35,
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuConfig {
    pub id: String,
    pub label: String,
    pub sectors: Vec<SectorConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectorConfig {
    pub id: String,
    pub label: String,
    pub icon: IconConfig,
    pub action: ActionConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum IconConfig {
    Text { value: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ActionConfig {
    App {
        program: String,
        args: Vec<String>,
    },
    File {
        path: String,
    },
    Url {
        url: String,
    },
    Hotkey {
        keys: Vec<String>,
    },
    Command {
        program: String,
        args: Vec<String>,
        confirm: bool,
    },
}
