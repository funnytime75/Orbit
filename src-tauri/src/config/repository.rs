use crate::config::model::{
    ActionConfig, IconConfig, MenuConfig, OrbitConfig, SectorConfig, ThemeMode, TriggerButton,
    TriggerConfig, WheelConfig,
};

pub fn default_config() -> OrbitConfig {
    OrbitConfig {
        version: 1,
        enabled: true,
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
                    id: "docs".to_string(),
                    label: "项目文档".to_string(),
                    icon: IconConfig::Text {
                        value: "D".to_string(),
                    },
                    action: ActionConfig::File {
                        path: "Orbit.md".to_string(),
                    },
                },
            ],
        }],
    }
}
