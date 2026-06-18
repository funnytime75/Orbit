use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OrbitError {
    #[error("配置文件格式无效：{0}")]
    ConfigInvalid(String),
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
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
