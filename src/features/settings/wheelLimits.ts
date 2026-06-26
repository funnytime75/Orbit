import type { OrbitConfig } from "./configSchema";

export const WHEEL_SIZE_MIN = 240;
export const WHEEL_SIZE_MAX = 720;
export const WHEEL_OUTER_RADIUS_MIN = 60;
export const WHEEL_EDGE_PADDING_PX = 18;
export const WHEEL_MIN_SECTOR_THICKNESS_PX = 48;

export function getMaxOuterRadius(sizePx: number): number {
  return Math.floor(sizePx / 2) - WHEEL_EDGE_PADDING_PX;
}

export function getMinOuterRadius(innerRadiusPx: number): number {
  return Math.max(WHEEL_OUTER_RADIUS_MIN, innerRadiusPx + WHEEL_MIN_SECTOR_THICKNESS_PX);
}

export function getMinWheelSize(innerRadiusPx: number): number {
  return Math.max(WHEEL_SIZE_MIN, (getMinOuterRadius(innerRadiusPx) + WHEEL_EDGE_PADDING_PX) * 2);
}

export function clampWheelGeometry(wheel: OrbitConfig["wheel"]): OrbitConfig["wheel"] {
  const sizePx = clampInt(wheel.sizePx, getMinWheelSize(wheel.innerRadiusPx), WHEEL_SIZE_MAX);
  const minOuterRadiusPx = getMinOuterRadius(wheel.innerRadiusPx);
  const maxOuterRadiusPx = getMaxOuterRadius(sizePx);
  const outerRadiusPx = clampInt(wheel.outerRadiusPx, minOuterRadiusPx, maxOuterRadiusPx);

  return {
    ...wheel,
    sizePx,
    outerRadiusPx,
  };
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, min), max);
}
