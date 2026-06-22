use std::path::Path;
use std::process::Command;
use std::sync::RwLock;

use crate::config::model::ActionConfig;
use crate::error::OrbitError;

pub fn execute_action(
    action: &ActionConfig,
    last_action_error: &RwLock<Option<String>>,
) -> Result<(), OrbitError> {
    let result = match action {
        ActionConfig::App { program, args } => execute_app(program, args),
        ActionConfig::File { .. } => Err(OrbitError::ActionUnsupported(
            "暂不支持从设置页执行文件动作".to_string(),
        )),
        ActionConfig::Url { .. } => Err(OrbitError::ActionUnsupported(
            "暂不支持从设置页执行网址动作".to_string(),
        )),
        ActionConfig::Hotkey { .. } => Err(OrbitError::ActionUnsupported(
            "暂不支持执行快捷键动作".to_string(),
        )),
        ActionConfig::Command { .. } => Err(OrbitError::ActionUnsupported(
            "暂不支持执行命令动作".to_string(),
        )),
    };

    match result {
        Ok(()) => {
            if let Ok(mut error) = last_action_error.write() {
                *error = None;
            }
            Ok(())
        }
        Err(error) => {
            if let Ok(mut last_error) = last_action_error.write() {
                *last_error = Some(error.to_string());
            }
            Err(error)
        }
    }
}

fn execute_app(program: &str, args: &[String]) -> Result<(), OrbitError> {
    validate_windows_exe(program)?;

    Command::new(program)
        .args(args)
        .spawn()
        .map_err(|error| OrbitError::ActionFailed(format!("启动应用失败：{error}")))?;

    Ok(())
}

pub fn validate_windows_exe(program: &str) -> Result<(), OrbitError> {
    let path = Path::new(program);
    if program.trim().is_empty() {
        return Err(OrbitError::ConfigInvalid("应用路径不能为空".to_string()));
    }

    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
    {
        return Err(OrbitError::ConfigInvalid(
            "首版只支持 Windows .exe 应用".to_string(),
        ));
    }

    if path.is_absolute() && !path.exists() {
        return Err(OrbitError::ConfigInvalid(format!("应用不存在：{program}")));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_windows_exe;

    #[test]
    fn rejects_non_exe_path() {
        let error = validate_windows_exe("C:\\Tools\\demo.cmd").expect_err("应该拒绝非 exe 路径");

        assert!(error.to_string().contains(".exe"));
    }

    #[test]
    fn rejects_missing_exe_path() {
        let error = validate_windows_exe("C:\\DefinitelyMissing\\orbit.exe")
            .expect_err("应该拒绝不存在的 exe");

        assert!(error.to_string().contains("应用不存在"));
    }

    #[test]
    fn accepts_bare_exe_name_for_default_config() {
        assert!(validate_windows_exe("notepad.exe").is_ok());
    }
}
