use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use crate::config::model::OrbitConfig;

pub struct AppState {
    pub config: RwLock<OrbitConfig>,
    pub runtime: RwLock<RuntimeStatus>,
    pub last_action_error: RwLock<Option<String>>,
    pub save_lock: Mutex<()>,
    pub config_path: PathBuf,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub enabled: bool,
    pub config_loaded: bool,
    pub active_session: bool,
    pub last_action_error: Option<String>,
    pub config_load_error: Option<String>,
}

impl AppState {
    pub fn new(
        config: OrbitConfig,
        config_path: PathBuf,
        config_load_error: Option<String>,
    ) -> Self {
        let runtime = RuntimeStatus {
            enabled: config.enabled,
            config_loaded: config_load_error.is_none(),
            active_session: false,
            last_action_error: None,
            config_load_error,
        };

        Self {
            config: RwLock::new(config),
            runtime: RwLock::new(runtime),
            last_action_error: RwLock::new(None),
            save_lock: Mutex::new(()),
            config_path,
        }
    }
}
