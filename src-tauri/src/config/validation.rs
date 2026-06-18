use crate::config::model::{ActionConfig, IconConfig, OrbitConfig};
use crate::error::OrbitError;

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

fn validate_range(value: u16, min: u16, max: u16, path: &'static str) -> Result<(), OrbitError> {
    if value < min || value > max {
        return Err(invalid(format!("{path} 必须在 {min} 到 {max} 之间")));
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
}
