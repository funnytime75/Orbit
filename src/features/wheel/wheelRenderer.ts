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

  const appearance = wheel.appearance;
  const ratio = window.devicePixelRatio || 1;
  const displaySize = wheel.sizePx;
  canvas.width = Math.floor(displaySize * ratio);
  canvas.height = Math.floor(displaySize * ratio);
  canvas.style.width = `${displaySize}px`;
  canvas.style.height = `${displaySize}px`;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, displaySize, displaySize);
  drawWheelBackdrop(context, center, wheel);

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
    context.fillStyle = index === activeIndex ? appearance.activeColor : getSectorFill(wheel);
    context.fill();
    context.strokeStyle = appearance.borderColor;
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
  context.fillStyle = getCenterFill(wheel);
  context.fill();
  context.strokeStyle = appearance.borderColor;
  context.stroke();
  context.fillStyle = "#475569";
  context.font = "600 13px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("Orbit", center.x, center.y);

  return activeIndex;
}

function drawWheelBackdrop(context: CanvasRenderingContext2D, center: Point, wheel: WheelConfig) {
  const appearance = wheel.appearance;
  const padding = Math.max(12, Math.round(appearance.blurPx * 0.7));
  const radius = wheel.outerRadiusPx + padding;
  const gradient = context.createRadialGradient(
    center.x,
    center.y,
    wheel.innerRadiusPx,
    center.x,
    center.y,
    radius,
  );

  const baseColor = hexToRgb(appearance.backgroundColor);
  const alpha = materialAlpha(appearance.material, appearance.opacity);
  gradient.addColorStop(0, rgba(baseColor, Math.min(1, alpha + 0.08)));
  gradient.addColorStop(0.72, rgba(baseColor, alpha));
  gradient.addColorStop(1, rgba(baseColor, Math.max(0, alpha - 0.18)));

  context.save();
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.shadowColor = shadowColor(appearance.material);
  context.shadowBlur = appearance.material === "transparent" ? 0 : Math.max(6, appearance.blurPx);
  context.shadowOffsetY = appearance.material === "solid" ? 3 : 8;
  context.fill();
  context.restore();

  if (appearance.material === "acrylic" || appearance.material === "frosted") {
    drawAcrylicHighlight(context, center, radius, appearance.opacity);
  }

  if (appearance.background.type === "image") {
    drawReservedImageBackground(context, center, radius, appearance.background.opacity);
  }
}

function drawAcrylicHighlight(context: CanvasRenderingContext2D, center: Point, radius: number, opacity: number) {
  const highlight = context.createLinearGradient(
    center.x - radius,
    center.y - radius,
    center.x + radius,
    center.y + radius,
  );
  highlight.addColorStop(0, `rgba(255, 255, 255, ${0.26 * opacity})`);
  highlight.addColorStop(0.38, `rgba(255, 255, 255, ${0.08 * opacity})`);
  highlight.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.save();
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fillStyle = highlight;
  context.fill();
  context.restore();
}

function drawReservedImageBackground(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  opacity: number,
) {
  context.save();
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = `rgba(15, 23, 42, ${opacity})`;
  context.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2);
  context.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.3, opacity)})`;
  context.lineWidth = 2;
  for (let offset = -radius; offset < radius * 2; offset += 18) {
    context.beginPath();
    context.moveTo(center.x - radius + offset, center.y + radius);
    context.lineTo(center.x + radius + offset, center.y - radius);
    context.stroke();
  }
  context.restore();
}

function getSectorFill(wheel: WheelConfig): string {
  const color = hexToRgb(wheel.appearance.backgroundColor);
  switch (wheel.appearance.material) {
    case "transparent":
      return rgba(color, 0.24);
    case "acrylic":
      return rgba(color, Math.min(0.78, wheel.appearance.opacity * 0.72));
    case "frosted":
      return rgba(color, Math.min(0.9, wheel.appearance.opacity * 0.84));
    case "solid":
      return rgba(color, 1);
  }
}

function getCenterFill(wheel: WheelConfig): string {
  const color = hexToRgb(wheel.appearance.backgroundColor);
  return rgba(color, wheel.appearance.material === "solid" ? 1 : Math.max(0.72, wheel.appearance.opacity));
}

function materialAlpha(material: WheelConfig["appearance"]["material"], opacity: number): number {
  switch (material) {
    case "transparent":
      return Math.min(0.5, opacity * 0.55);
    case "acrylic":
      return opacity;
    case "frosted":
      return Math.min(0.92, opacity + 0.08);
    case "solid":
      return 1;
  }
}

function shadowColor(material: WheelConfig["appearance"]["material"]): string {
  return material === "transparent" ? "rgba(0, 0, 0, 0)" : "rgba(15, 23, 42, 0.22)";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgba(color: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha.toFixed(3)})`;
}
