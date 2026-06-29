use crate::config::model::{ActionConfig, IconConfig, OrbitConfig, WheelBackgroundType};
use crate::error::OrbitError;
use crate::shortcut::normalize_shortcut;
use std::path::Path;

const MAX_ICON_SOURCE_CHARS: usize = 256_000;
const PNG_ICON_DATA_URL_PREFIX: &str = "data:image/png;base64,";
const WHEEL_EDGE_PADDING_PX: u16 = 18;
const WHEEL_MIN_SECTOR_THICKNESS_PX: u16 = 48;

pub fn validate_config(config: &OrbitConfig) -> Result<(), OrbitError> {
    if config.version != 1 {
        return Err(invalid("仅支持版本 1 的配置"));
    }

    validate_trigger_shortcut(&config.trigger.shortcut)?;
    validate_range(config.trigger.hold_ms, 120, 600, "trigger.holdMs")?;
    validate_range(
        config.trigger.move_threshold_px,
        8,
        60,
        "trigger.moveThresholdPx",
    )?;
    validate_range(
        config.trigger.cancel_distance_px,
        0,
        120,
        "trigger.cancelDistancePx",
    )?;
    validate_range(config.wheel.size_px, 240, 720, "wheel.sizePx")?;

    if config.wheel.inner_radius_px >= config.wheel.outer_radius_px {
        return Err(invalid("wheel.innerRadiusPx 必须小于 wheel.outerRadiusPx"));
    }
    let max_outer_radius = config.wheel.size_px / 2 - WHEEL_EDGE_PADDING_PX;
    if config.wheel.outer_radius_px > max_outer_radius {
        return Err(invalid(
            "wheel.outerRadiusPx 不能超过 wheel.sizePx 允许范围",
        ));
    }
    if config.wheel.outer_radius_px - config.wheel.inner_radius_px < WHEEL_MIN_SECTOR_THICKNESS_PX {
        return Err(invalid(format!(
            "wheel.outerRadiusPx 扇区宽度不能小于 {WHEEL_MIN_SECTOR_THICKNESS_PX}px"
        )));
    }
    validate_appearance(config)?;

    if config.menus.is_empty() {
        return Err(invalid("menus 至少需要一个菜单"));
    }

    for (menu_index, menu) in config.menus.iter().enumerate() {
        validate_id(&menu.id, format!("menus[{menu_index}].id"))?;
        validate_label(&menu.label, format!("menus[{menu_index}].label"))?;

        if !(2..=12).contains(&menu.sectors.len()) {
            return Err(invalid(format!(
                "menus[{menu_index}].sectors 必须包含 2 到 12 个扇区"
            )));
        }

        for (sector_index, sector) in menu.sectors.iter().enumerate() {
            let sector_path = format!("menus[{menu_index}].sectors[{sector_index}]");
            validate_id(&sector.id, format!("{sector_path}.id"))?;
            validate_label(&sector.label, format!("{sector_path}.label"))?;
            validate_icon(&sector.icon, format!("{sector_path}.icon"))?;
            validate_action(&sector.action, format!("{sector_path}.action"))?;
        }
    }

    Ok(())
}

fn validate_appearance(config: &OrbitConfig) -> Result<(), OrbitError> {
    let appearance = &config.wheel.appearance;
    validate_float_range(appearance.opacity, 0.35, 1.0, "wheel.appearance.opacity")?;
    validate_range(appearance.blur_px, 0, 32, "wheel.appearance.blurPx")?;
    validate_float_range(
        appearance.background.opacity,
        0.0,
        0.6,
        "wheel.appearance.background.opacity",
    )?;
    validate_hex_color(
        &appearance.background_color,
        "wheel.appearance.backgroundColor",
    )?;
    validate_hex_color(&appearance.border_color, "wheel.appearance.borderColor")?;
    validate_hex_color(&appearance.active_color, "wheel.appearance.activeColor")?;

    if matches!(
        appearance.background.background_type,
        WheelBackgroundType::Image
    ) {
        let Some(image_path) = appearance.background.image_path.as_deref() else {
            return Err(invalid("wheel.appearance.background.imagePath 不能为空"));
        };
        let image_path = image_path.trim();
        if image_path.is_empty() {
            return Err(invalid("wheel.appearance.background.imagePath 不能为空"));
        }
        if !is_supported_background_image_path(image_path) {
            return Err(invalid(
                "wheel.appearance.background.imagePath 只支持 png、jpg、jpeg、webp 或 bmp",
            ));
        }
    }

    Ok(())
}

fn is_supported_background_image_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".webp", ".bmp"]
        .iter()
        .any(|extension| lower.ends_with(extension))
}

fn validate_range(value: u16, min: u16, max: u16, path: &'static str) -> Result<(), OrbitError> {
    if value < min || value > max {
        return Err(invalid(format!("{path} 必须在 {min} 到 {max} 之间")));
    }

    Ok(())
}

fn validate_float_range(
    value: f32,
    min: f32,
    max: f32,
    path: &'static str,
) -> Result<(), OrbitError> {
    if !value.is_finite() || value < min || value > max {
        return Err(invalid(format!("{path} 必须在 {min} 到 {max} 之间")));
    }

    Ok(())
}

fn validate_hex_color(value: &str, path: &'static str) -> Result<(), OrbitError> {
    let color = value.trim();
    let hex = color.strip_prefix('#').unwrap_or("");
    if hex.len() != 6 || !hex.chars().all(|item| item.is_ascii_hexdigit()) {
        return Err(invalid(format!("{path} 必须是 #RRGGBB 格式")));
    }

    Ok(())
}

fn validate_trigger_shortcut(value: &str) -> Result<(), OrbitError> {
    if normalize_shortcut(value).is_none() {
        return Err(invalid(
            "trigger.shortcut 必须使用 Ctrl、Alt、Shift 或 Win 与另一个按键组合",
        ));
    }

    Ok(())
}

fn validate_id(value: &str, path: String) -> Result<(), OrbitError> {
    if value.is_empty()
        || !value.chars().all(|item| {
            item.is_ascii_lowercase() || item.is_ascii_digit() || item == '-' || item == '_'
        })
    {
        return Err(invalid(format!(
            "{path} 只能包含小写字母、数字、短横线和下划线"
        )));
    }

    Ok(())
}

fn validate_label(value: &str, path: String) -> Result<(), OrbitError> {
    if value.trim().is_empty() || value.chars().count() > 32 {
        return Err(invalid(format!("{path} 不能为空且最多 32 个字符")));
    }

    Ok(())
}

fn validate_icon(icon: &IconConfig, path: String) -> Result<(), OrbitError> {
    match icon {
        IconConfig::Text { value } => validate_icon_text(value, format!("{path}.value")),
        IconConfig::Image { source, fallback } => {
            validate_icon_text(fallback, format!("{path}.fallback"))?;
            if !source.starts_with(PNG_ICON_DATA_URL_PREFIX)
                || source.len() > MAX_ICON_SOURCE_CHARS
                || source[PNG_ICON_DATA_URL_PREFIX.len()..].trim().is_empty()
            {
                return Err(invalid(format!(
                    "{path}.source 必须是有效且不超过 256KB 的 PNG data URL"
                )));
            }
            Ok(())
        }
    }
}

fn validate_icon_text(value: &str, path: String) -> Result<(), OrbitError> {
    if value.trim().is_empty() || value.chars().count() > 4 {
        return Err(invalid(format!("{path} 必须为 1 到 4 个字符")));
    }

    Ok(())
}

fn validate_action(action: &ActionConfig, path: String) -> Result<(), OrbitError> {
    match action {
        ActionConfig::App { program, .. } if program.trim().is_empty() => {
            Err(invalid(format!("{path}.program 不能为空")))
        }
        ActionConfig::App { program, .. } => validate_app_program_shape(program),
        ActionConfig::File { .. }
        | ActionConfig::Url { .. }
        | ActionConfig::Hotkey { .. }
        | ActionConfig::Command { .. } => Err(invalid(format!("{path}.type 当前只支持 app 动作"))),
    }
}

fn validate_app_program_shape(program: &str) -> Result<(), OrbitError> {
    if !Path::new(program)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
    {
        return Err(invalid("首版只支持 Windows .exe 应用"));
    }

    Ok(())
}

fn invalid(message: impl Into<String>) -> OrbitError {
    OrbitError::ConfigInvalid(message.into())
}

#[cfg(test)]
mod tests {
    use super::validate_config;
    use crate::config::model::IconConfig;
    use crate::config::repository::default_config;

    #[test]
    fn accepts_default_config() {
        let config = default_config();

        assert!(validate_config(&config).is_ok());
    }

    #[test]
    fn rejects_invalid_radius() {
        let mut config = default_config();
        config.wheel.inner_radius_px = 200;
        config.wheel.outer_radius_px = 100;

        let error = validate_config(&config).expect_err("应该拒绝无效半径");

        assert!(error.to_string().contains("innerRadiusPx"));
    }

    #[test]
    fn rejects_too_thin_sector_width() {
        let mut config = default_config();
        config.wheel.outer_radius_px = config.wheel.inner_radius_px + 20;

        let error = validate_config(&config).expect_err("应该拒绝过窄扇区");

        assert!(error.to_string().contains("扇区宽度不能小于 48px"));
    }

    #[test]
    fn rejects_outer_radius_outside_wheel_size() {
        let mut config = default_config();
        config.wheel.size_px = 240;
        config.wheel.outer_radius_px = 156;

        let error = validate_config(&config).expect_err("应该拒绝超出尺寸的外半径");

        assert!(error.to_string().contains("outerRadiusPx"));
    }

    #[test]
    fn rejects_invalid_id() {
        let mut config = default_config();
        config.menus[0].sectors[0].id = "Chrome App".to_string();

        let error = validate_config(&config).expect_err("应该拒绝无效 ID");

        assert!(error.to_string().contains("只能包含小写字母"));
    }

    #[test]
    fn accepts_keyboard_shortcut_trigger() {
        let mut config = default_config();
        config.trigger.shortcut = "Ctrl+Shift+K".to_string();

        assert!(validate_config(&config).is_ok());
    }

    #[test]
    fn rejects_single_key_trigger_shortcut() {
        let mut config = default_config();
        config.trigger.shortcut = "Space".to_string();

        let error = validate_config(&config).expect_err("应该拒绝单键触发");

        assert!(error.to_string().contains("trigger.shortcut"));
    }

    #[test]
    fn rejects_invalid_appearance_opacity() {
        let mut config = default_config();
        config.wheel.appearance.opacity = 0.2;

        let error = validate_config(&config).expect_err("应该拒绝过低透明度");

        assert!(error.to_string().contains("appearance.opacity"));
    }

    #[test]
    fn rejects_invalid_appearance_color() {
        let mut config = default_config();
        config.wheel.appearance.active_color = "blue".to_string();

        let error = validate_config(&config).expect_err("应该拒绝非十六进制颜色");

        assert!(error.to_string().contains("#RRGGBB"));
    }

    #[test]
    fn rejects_image_background_without_path() {
        use crate::config::model::WheelBackgroundType;

        let mut config = default_config();
        config.wheel.appearance.background.background_type = WheelBackgroundType::Image;
        config.wheel.appearance.background.image_path = None;

        let error = validate_config(&config).expect_err("应该拒绝缺少路径的图片背景");

        assert!(error.to_string().contains("imagePath"));
    }

    #[test]
    fn rejects_unsupported_image_background_extension() {
        use crate::config::model::WheelBackgroundType;

        let mut config = default_config();
        config.wheel.appearance.background.background_type = WheelBackgroundType::Image;
        config.wheel.appearance.background.image_path =
            Some("C:\\Wallpapers\\orbit.gif".to_string());

        let error = validate_config(&config).expect_err("应该拒绝不支持的图片格式");

        assert!(error.to_string().contains("png、jpg、jpeg、webp 或 bmp"));
    }

    #[test]
    fn accepts_supported_image_background_extension() {
        use crate::config::model::WheelBackgroundType;

        let mut config = default_config();
        config.wheel.appearance.background.background_type = WheelBackgroundType::Image;
        config.wheel.appearance.background.image_path =
            Some("C:\\Wallpapers\\orbit.webp".to_string());

        assert!(validate_config(&config).is_ok());
    }

    #[test]
    fn accepts_missing_absolute_exe_path_while_loading_config() {
        let mut config = default_config();
        config.menus[0].sectors[0].action = crate::config::model::ActionConfig::App {
            program: "C:\\DefinitelyMissing\\orbit.exe".to_string(),
            args: vec![],
        };

        assert!(validate_config(&config).is_ok());
    }

    #[test]
    fn rejects_non_exe_app_program() {
        let mut config = default_config();
        config.menus[0].sectors[0].action = crate::config::model::ActionConfig::App {
            program: "C:\\Tools\\demo.cmd".to_string(),
            args: vec![],
        };

        let error = validate_config(&config).expect_err("应该拒绝非 exe 应用路径");

        assert!(error.to_string().contains(".exe"));
    }

    #[test]
    fn rejects_unsupported_action_type() {
        let mut config = default_config();
        config.menus[0].sectors[0].action = crate::config::model::ActionConfig::Url {
            url: "https://example.com".to_string(),
        };

        let error = validate_config(&config).expect_err("应该拒绝未实现动作");

        assert!(error.to_string().contains("当前只支持 app 动作"));
    }

    #[test]
    fn accepts_image_icon_data_url() {
        let mut config = default_config();
        config.menus[0].sectors[0].icon = IconConfig::Image {
            source: "data:image/png;base64,aGVsbG8=".to_string(),
            fallback: "C".to_string(),
        };

        assert!(validate_config(&config).is_ok());
    }

    #[test]
    fn rejects_invalid_image_icon_source() {
        let mut config = default_config();
        config.menus[0].sectors[0].icon = IconConfig::Image {
            source: "data:image/jpeg;base64,aGVsbG8=".to_string(),
            fallback: "C".to_string(),
        };

        let error = validate_config(&config).expect_err("应该拒绝非 PNG 图标");

        assert!(error.to_string().contains("PNG data URL"));
    }
}
