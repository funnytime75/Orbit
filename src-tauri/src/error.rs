use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OrbitError {
    #[error("配置文件格式无效：{0}")]
    ConfigInvalid(String),
    #[error("配置文件读写失败：{0}")]
    ConfigIo(String),
    #[error("动作执行失败：{0}")]
    ActionFailed(String),
    #[error("动作暂不支持：{0}")]
    ActionUnsupported(String),
    #[error("运行状态访问失败：{0}")]
    State(String),
    #[error("开机自启同步失败：{0}")]
    Autostart(String),
    #[error("触发快捷键同步失败：{0}")]
    Shortcut(String),
    #[error("鼠标触发监听失败：{0}")]
    MouseHook(String),
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
    pub detail: String,
}

impl From<OrbitError> for CommandError {
    fn from(error: OrbitError) -> Self {
        match error {
            OrbitError::ConfigInvalid(detail) => Self {
                code: "CONFIG_INVALID",
                message: "配置文件格式无效".to_string(),
                detail,
            },
            OrbitError::ConfigIo(detail) => Self {
                code: "CONFIG_IO_FAILED",
                message: "配置文件读写失败".to_string(),
                detail,
            },
            OrbitError::ActionFailed(detail) => Self {
                code: "ACTION_FAILED",
                message: "动作执行失败".to_string(),
                detail,
            },
            OrbitError::ActionUnsupported(detail) => Self {
                code: "ACTION_UNSUPPORTED",
                message: "动作暂不支持".to_string(),
                detail,
            },
            OrbitError::State(detail) => Self {
                code: "STATE_FAILED",
                message: "运行状态访问失败".to_string(),
                detail,
            },
            OrbitError::Autostart(detail) => Self {
                code: "AUTOSTART_FAILED",
                message: "开机自启同步失败".to_string(),
                detail,
            },
            OrbitError::Shortcut(detail) => Self {
                code: "SHORTCUT_FAILED",
                message: "触发快捷键同步失败".to_string(),
                detail,
            },
            OrbitError::MouseHook(detail) => Self {
                code: "MOUSE_HOOK_FAILED",
                message: "鼠标触发监听失败".to_string(),
                detail,
            },
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
