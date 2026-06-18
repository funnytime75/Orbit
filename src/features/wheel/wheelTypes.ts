import type { OrbitConfig } from "../settings/configSchema";

export type WheelConfig = OrbitConfig["wheel"];
export type WheelMenu = OrbitConfig["menus"][number];
export type WheelSector = WheelMenu["sectors"][number];
