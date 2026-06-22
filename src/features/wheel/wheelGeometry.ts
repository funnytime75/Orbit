export interface Point {
  x: number;
  y: number;
}

export function getAngleDeg(center: Point, cursor: Point): number {
  const angle = (Math.atan2(cursor.y - center.y, cursor.x - center.x) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export function getDistance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function getSectorIndex(angleDeg: number, sectorCount: number, startAngleDeg: number): number {
  if (!Number.isInteger(sectorCount) || sectorCount <= 0) {
    throw new Error("扇区数量必须是正整数");
  }

  const normalized = (angleDeg - startAngleDeg + 360) % 360;
  const sectorSize = 360 / sectorCount;
  return Math.floor(normalized / sectorSize);
}

export function getActiveSectorIndex(
  center: Point,
  cursor: Point,
  sectorCount: number,
  startAngleDeg: number,
  innerRadiusPx: number,
): number | null {
  if (getDistance(center, cursor) < innerRadiusPx) {
    return null;
  }

  return getSectorIndex(getAngleDeg(center, cursor), sectorCount, startAngleDeg);
}

export function getValidSectorIndex(index: number | null, sectorCount: number): number | null {
  if (index === null || !Number.isInteger(index) || index < 0 || index >= sectorCount) {
    return null;
  }

  return index;
}
