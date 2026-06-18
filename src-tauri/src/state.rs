use std::sync::RwLock;

use crate::config::model::OrbitConfig;

pub struct AppState {
    pub config: RwLock<OrbitConfig>,
    pub runtime: RwLock<RuntimeStatus>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub enabled: bool,
    pub config_loaded: bool,
    pub active_session: bool,
}

impl AppState {
    pub fn new(config: OrbitConfig) -> Self {
        let runtime = RuntimeStatus {
            enabled: config.enabled,
            config_loaded: true,
            active_session: false,
        };

        Self {
            config: RwLock::new(config),
            runtime: RwLock::new(runtime),
        }
    }
}
