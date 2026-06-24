import type { OrbitConfig } from "./configSchema";

export const MIN_SECTOR_COUNT = 2;
export const MAX_SECTOR_COUNT = 12;

export interface AppSelection {
  path: string;
}

export function createSectorFromApp(selection: AppSelection, existingIds: string[] = []): OrbitConfig["menus"][number]["sectors"][number] {
  if (!selection.path.trim().toLowerCase().endsWith(".exe")) {
    throw new Error("首版只支持 Windows .exe 应用");
  }

  const label = getFileStem(selection.path);
  const baseId = toSectorId(label);

  return {
    id: uniqueId(baseId, existingIds),
    label,
    icon: {
      type: "text",
      value: createTextIcon(label),
    },
    action: {
      type: "app",
      program: selection.path,
      args: [],
    },
  };
}

export function addSector(config: OrbitConfig, sector: OrbitConfig["menus"][number]["sectors"][number]): OrbitConfig {
  const sectors = getMainSectors(config);
  if (sectors.length >= MAX_SECTOR_COUNT) {
    throw new Error(`最多支持 ${MAX_SECTOR_COUNT} 个扇区`);
  }

  return updateMainSectors(config, [...sectors, sector]);
}

export function removeSector(config: OrbitConfig, sectorId: string): OrbitConfig {
  const sectors = getMainSectors(config);
  if (sectors.length <= MIN_SECTOR_COUNT) {
    throw new Error(`至少需要 ${MIN_SECTOR_COUNT} 个扇区`);
  }

  return updateMainSectors(
    config,
    sectors.filter((sector) => sector.id !== sectorId),
  );
}

export function updateSector(
  config: OrbitConfig,
  sectorId: string,
  patch: Partial<Pick<OrbitConfig["menus"][number]["sectors"][number], "label" | "icon">>,
): OrbitConfig {
  return updateMainSectors(
    config,
    getMainSectors(config).map((sector) => (sector.id === sectorId ? { ...sector, ...patch } : sector)),
  );
}

export function replaceSectorWithApp(config: OrbitConfig, sectorId: string, selection: AppSelection): OrbitConfig {
  const sectors = getMainSectors(config);
  const current = sectors.find((sector) => sector.id === sectorId);
  if (!current) {
    throw new Error("找不到要替换的扇区");
  }

  const replacement = createSectorFromApp(
    selection,
    sectors.map((sector) => sector.id).filter((id) => id !== sectorId),
  );

  return updateMainSectors(
    config,
    sectors.map((sector) => (sector.id === sectorId ? { ...replacement, id: current.id } : sector)),
  );
}

export function moveSector(config: OrbitConfig, sectorId: string, direction: "up" | "down"): OrbitConfig {
  const sectors = [...getMainSectors(config)];
  const index = sectors.findIndex((sector) => sector.id === sectorId);
  if (index === -1) {
    return config;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sectors.length) {
    return config;
  }

  const current = sectors[index];
  sectors[index] = sectors[targetIndex];
  sectors[targetIndex] = current;
  return updateMainSectors(config, sectors);
}

export function moveSectorToIndex(config: OrbitConfig, sectorId: string, targetIndex: number): OrbitConfig {
  const sectors = [...getMainSectors(config)];
  const currentIndex = sectors.findIndex((sector) => sector.id === sectorId);
  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= sectors.length || currentIndex === targetIndex) {
    return config;
  }

  const [sector] = sectors.splice(currentIndex, 1);
  sectors.splice(targetIndex, 0, sector);
  return updateMainSectors(config, sectors);
}

export function hasDuplicateApp(config: OrbitConfig, program: string, ignoreSectorId?: string): boolean {
  return getMainSectors(config).some(
    (sector) =>
      sector.id !== ignoreSectorId &&
      sector.action.type === "app" &&
      normalizePath(sector.action.program) === normalizePath(program),
  );
}

export function rememberAppPickerDir(config: OrbitConfig, appPath: string): OrbitConfig {
  return {
    ...config,
    uiState: {
      ...config.uiState,
      lastAppPickerDir: getDirectory(appPath),
    },
  };
}

function updateMainSectors(
  config: OrbitConfig,
  sectors: OrbitConfig["menus"][number]["sectors"],
): OrbitConfig {
  if (!config.menus[0]) {
    throw new Error("缺少主菜单配置");
  }

  const menus = [...config.menus];
  menus[0] = {
    ...menus[0],
    sectors,
  };

  return {
    ...config,
    menus,
  };
}

function getMainSectors(config: OrbitConfig): OrbitConfig["menus"][number]["sectors"] {
  const mainMenu = config.menus[0];
  if (!mainMenu) {
    throw new Error("缺少主菜单配置");
  }

  return mainMenu.sectors;
}

function getFileStem(path: string): string {
  const parts = path.split(/[\\/]/);
  const fileName = parts[parts.length - 1] ?? "应用";
  return fileName.replace(/\.[^.]+$/, "") || "应用";
}

function createTextIcon(label: string): string {
  const first = Array.from(label.trim())[0];
  return (first || "A").toUpperCase();
}

function toSectorId(label: string): string {
  const ascii = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "app";
}

function uniqueId(baseId: string, existingIds: string[]): string {
  if (!existingIds.includes(baseId)) {
    return baseId;
  }

  let index = 2;
  while (existingIds.includes(`${baseId}-${index}`)) {
    index += 1;
  }
  return `${baseId}-${index}`;
}

function normalizePath(path: string): string {
  return path.trim().replace(/\//g, "\\").toLowerCase();
}

function getDirectory(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return lastSlash > 0 ? path.slice(0, lastSlash) : "";
}
