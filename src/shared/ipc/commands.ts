import { invoke } from "@tauri-apps/api/core";
import type { OrbitAction, OrbitConfig } from "../../features/settings/configSchema";
import { validateOrbitConfig } from "../../features/settings/configSchema";

export interface RuntimeStatus {
  enabled: boolean;
  configLoaded: boolean;
  activeSession: boolean;
  lastActionError: string | null;
  configLoadError: string | null;
}

export async function loadConfig(): Promise<OrbitConfig> {
  const config = await invoke<unknown>("load_config");
  return validateOrbitConfig(config);
}

export async function validateConfig(config: OrbitConfig): Promise<OrbitConfig> {
  const validated = await invoke<unknown>("validate_config", { config });
  return validateOrbitConfig(validated);
}

export async function saveConfig(config: OrbitConfig): Promise<OrbitConfig> {
  const saved = await invoke<unknown>("save_config", { config });
  return validateOrbitConfig(saved);
}

export async function executeAction(action: OrbitAction): Promise<void> {
  await invoke("execute_action", { action });
}

export async function loadBackgroundImage(imagePath: string): Promise<string> {
  return invoke<string>("load_background_image", { imagePath });
}

export async function loadAppIcon(program: string): Promise<string | null> {
  return invoke<string | null>("load_app_icon", { program });
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>("get_runtime_status");
}
