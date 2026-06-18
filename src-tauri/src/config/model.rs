use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrbitConfig {
    pub version: u8,
    pub enabled: bool,
    pub trigger: TriggerConfig,
    pub wheel: WheelConfig,
    pub menus: Vec<MenuConfig>,
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
