import type { Point } from "./wheelGeometry";
import { getActiveSectorIndex } from "./wheelGeometry";
import type { WheelConfig, WheelMenu } from "./wheelTypes";

interface DrawWheelOptions {
  canvas: HTMLCanvasElement;
  center: Point;
  cursor: Point;
  menu: WheelMenu;
  wheel: WheelConfig;
}

export function drawWheel({ canvas, center, cursor, menu, wheel }: DrawWheelOptions): number | null {
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const ratio = window.devicePixelRatio || 1;
  const displaySize = wheel.sizePx;
  canvas.width = Math.floor(displaySize * ratio);
  canvas.height = Math.floor(displaySize * ratio);
  canvas.style.width = `${displaySize}px`;
  canvas.style.height = `${displaySize}px`;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, displaySize, displaySize);

  const activeIndex = getActiveSectorIndex(
    center,
    cursor,
    menu.sectors.length,
    wheel.startAngleDeg,
    wheel.innerRadiusPx,
  );
  const sectorAngle = (Math.PI * 2) / menu.sectors.length;
  const startAngle = (wheel.startAngleDeg * Math.PI) / 180;

  menu.sectors.forEach((sector, index) => {
    const from = startAngle + sectorAngle * index;
    const to = from + sectorAngle;

    context.beginPath();
    context.moveTo(center.x, center.y);
    context.arc(center.x, center.y, wheel.outerRadiusPx, from, to);
    context.closePath();
    context.fillStyle = index === activeIndex ? "#2563eb" : "#e2e8f0";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.stroke();

    const labelAngle = from + sectorAngle / 2;
    const labelRadius = (wheel.innerRadiusPx + wheel.outerRadiusPx) / 2;
    const labelX = center.x + Math.cos(labelAngle) * labelRadius;
    const labelY = center.y + Math.sin(labelAngle) * labelRadius;

    context.fillStyle = index === activeIndex ? "#ffffff" : "#0f172a";
    context.font = "600 14px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(sector.icon.value, labelX, labelY);
  });

  context.beginPath();
  context.arc(center.x, center.y, wheel.innerRadiusPx, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = "#cbd5e1";
  context.stroke();
  context.fillStyle = "#475569";
  context.font = "600 13px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("Orbit", center.x, center.y);

  return activeIndex;
}
