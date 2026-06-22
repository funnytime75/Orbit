use crate::config::model::{ActionConfig, IconConfig, OrbitConfig, WheelBackgroundType};
use crate::error::OrbitError;
use std::path::Path;

pub fn validate_config(config: &OrbitConfig) -> Result<(), OrbitError> {
    if config.version != 1 {
        return Err(invalid("仅支持版本 1 的配置"));
    }

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
    ) && appearance
        .background
        .image_path
        .as_deref()
        .is_none_or(|path| path.trim().is_empty())
    {
        return Err(invalid("wheel.appearance.background.imagePath 不能为空"));
    }

    Ok(())
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
        IconConfig::Text { value } if value.trim().is_empty() || value.chars().count() > 4 => {
            Err(invalid(format!("{path}.value 必须为 1 到 4 个字符")))
        }
        IconConfig::Text { .. } => Ok(()),
    }
}

fn validate_action(action: &ActionConfig, path: String) -> Result<(), OrbitError> {
    match action {
        ActionConfig::App { program, .. } if program.trim().is_empty() => {
            Err(invalid(format!("{path}.program 不能为空")))
        }
        ActionConfig::App { program, .. } => validate_app_program_shape(program),
        ActionConfig::File { path: file_path } if file_path.trim().is_empty() => {
            Err(invalid(format!("{path}.path 不能为空")))
        }
        ActionConfig::Url { url }
            if !(url.starts_with("http://") || url.starts_with("https://")) =>
        {
            Err(invalid(format!("{path}.url 只允许 http 或 https")))
        }
        ActionConfig::Hotkey { keys }
            if keys.is_empty() || keys.iter().any(|key| key.trim().is_empty()) =>
        {
            Err(invalid(format!("{path}.keys 不能为空")))
        }
        ActionConfig::Command {
            program, confirm, ..
        } if program.trim().is_empty() || !confirm => Err(invalid(format!(
            "{path}.program 不能为空且 confirm 必须为 true"
        ))),
        _ => Ok(()),
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
    fn rejects_invalid_id() {
        let mut config = default_config();
        config.menus[0].sectors[0].id = "Chrome App".to_string();

        let error = validate_config(&config).expect_err("应该拒绝无效 ID");

        assert!(error.to_string().contains("只能包含小写字母"));
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
}
