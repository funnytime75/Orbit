import { invoke } from "@tauri-apps/api/core";
import type { OrbitConfig } from "../../features/settings/configSchema";
import { validateOrbitConfig } from "../../features/settings/configSchema";

export interface RuntimeStatus {
  enabled: boolean;
  configLoaded: boolean;
  activeSession: boolean;
}

export async function loadConfig(): Promise<OrbitConfig> {
  const config = await invoke<unknown>("load_config");
  return validateOrbitConfig(config);
}

export async function validateConfig(config: OrbitConfig): Promise<OrbitConfig> {
  const validated = await invoke<unknown>("validate_config", { config });
  return validateOrbitConfig(validated);
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>("get_runtime_status");
}
