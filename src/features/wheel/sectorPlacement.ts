export interface SectorPlacement {
  accessibleLabel: string;
  cardinalLabel: string;
  clockLabel: string;
  compactLabel: string;
  indexLabel: string;
}

const CARDINAL_LABELS = ["右", "右下", "下", "左下", "左", "左上", "上", "右上"] as const;

export function getSectorPlacement(index: number, sectorCount: number, startAngleDeg: number): SectorPlacement {
  if (!Number.isInteger(sectorCount) || sectorCount <= 0) {
    throw new Error("扇区数量必须是正整数");
  }

  if (!Number.isInteger(index) || index < 0 || index >= sectorCount) {
    throw new Error("扇区序号超出范围");
  }

  const sectorSize = 360 / sectorCount;
  const centerAngle = normalizeAngle(startAngleDeg + sectorSize * index + sectorSize / 2);
  const cardinalLabel = getCardinalLabel(centerAngle);
  const clockLabel = getClockLabel(centerAngle);
  const indexLabel = `第 ${index + 1} 扇区`;

  return {
    accessibleLabel: `${indexLabel}，${clockLabel}，${cardinalLabel}方向`,
    cardinalLabel,
    clockLabel,
    compactLabel: `${clockLabel.replace("位", "")} · ${cardinalLabel}`,
    indexLabel,
  };
}

function getCardinalLabel(angleDeg: number): string {
  const labelIndex = Math.round(angleDeg / 45) % CARDINAL_LABELS.length;
  return CARDINAL_LABELS[labelIndex];
}

function getClockLabel(angleDeg: number): string {
  const clockIndex = Math.round(normalizeAngle(angleDeg + 90) / 30) % 12;
  const hour = clockIndex === 0 ? 12 : clockIndex;
  return `${hour}点位`;
}

function normalizeAngle(angleDeg: number): number {
  return ((angleDeg % 360) + 360) % 360;
}
