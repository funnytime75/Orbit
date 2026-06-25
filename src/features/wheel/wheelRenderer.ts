import type { Point } from "./wheelGeometry";
import { getActiveSectorIndex } from "./wheelGeometry";
import type { WheelConfig, WheelMenu, WheelSector } from "./wheelTypes";

interface DrawWheelOptions {
  backgroundImage?: CanvasImageSource | null;
  canvas: HTMLCanvasElement;
  center: Point;
  cursor: Point;
  iconImages?: ReadonlyMap<string, CanvasImageSource>;
  menu: WheelMenu;
  renderMode?: "preview" | "runtime";
  wheel: WheelConfig;
}

export function drawWheel({
  backgroundImage = null,
  canvas,
  center,
  cursor,
  iconImages = new Map(),
  menu,
  renderMode = "preview",
  wheel,
}: DrawWheelOptions): number | null {
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const appearance = wheel.appearance;
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const displaySize = wheel.sizePx;
  canvas.width = Math.floor(displaySize * ratio);
  canvas.height = Math.floor(displaySize * ratio);

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, displaySize, displaySize);
  drawWheelBackdrop(context, center, wheel, backgroundImage, renderMode);
  const transparentRuntime = isTransparentRuntime(wheel, renderMode);

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
    if (index === activeIndex || !transparentRuntime) {
      context.fillStyle = index === activeIndex ? appearance.activeColor : getSectorFill(wheel, renderMode);
      context.fill();
    }
    if (!transparentRuntime) {
      context.strokeStyle = appearance.borderColor;
      context.lineWidth = 2;
      context.stroke();
    }

    const labelAngle = from + sectorAngle / 2;
    const labelRadius = (wheel.innerRadiusPx + wheel.outerRadiusPx) / 2;
    const labelX = center.x + Math.cos(labelAngle) * labelRadius;
    const labelY = center.y + Math.sin(labelAngle) * labelRadius;

    drawSectorIdentity(context, {
      iconImage: iconImages.get(sector.id) ?? null,
      maxWidth: getSectorTextMaxWidth(sectorAngle, labelRadius),
      sector,
      textColor: index === activeIndex ? "#ffffff" : getReadableTextColor(wheel, renderMode),
      textShadow: transparentRuntime,
      x: labelX,
      y: labelY,
    });
  });

  context.beginPath();
  context.arc(center.x, center.y, wheel.innerRadiusPx, 0, Math.PI * 2);
  if (!transparentRuntime) {
    context.fillStyle = getCenterFill(wheel, renderMode);
    context.fill();
    context.strokeStyle = appearance.borderColor;
    context.stroke();
  }
  context.save();
  if (transparentRuntime) {
    applyTransparentTextShadow(context);
  }
  context.fillStyle = getCenterTextColor(wheel, renderMode);
  context.font = "600 13px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(renderMode === "runtime" ? "取消" : "Orbit", center.x, center.y);
  context.restore();

  return activeIndex;
}

interface SectorIdentityOptions {
  iconImage: CanvasImageSource | null;
  maxWidth: number;
  sector: WheelSector;
  textColor: string;
  textShadow?: boolean;
  x: number;
  y: number;
}

function drawSectorIdentity(
  context: CanvasRenderingContext2D,
  { iconImage, maxWidth, sector, textColor, textShadow = false, x, y }: SectorIdentityOptions,
) {
  context.save();
  if (textShadow) {
    applyTransparentTextShadow(context);
  }
  context.fillStyle = textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const imageDrawn = iconImage ? drawSectorIconImage(context, iconImage, x, y - 11, Math.min(28, maxWidth)) : false;
  if (!imageDrawn) {
    context.font = "800 18px system-ui";
    const iconText = fitCanvasText(getIconFallback(sector.icon), Math.min(34, maxWidth), (value) => context.measureText(value).width);
    context.fillText(iconText || "?", x, y - 9);
  }

  context.font = "700 11px system-ui";
  const labelText = fitCanvasText(sector.label || "应用", maxWidth, (value) => context.measureText(value).width);
  context.fillText(labelText, x, y + 13);
  context.restore();
}

function drawSectorIconImage(context: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, maxSize: number): boolean {
  const imageSize = getImageSize(image);
  if (!imageSize) {
    return false;
  }

  const scale = Math.min(maxSize / imageSize.width, maxSize / imageSize.height);
  const drawWidth = imageSize.width * scale;
  const drawHeight = imageSize.height * scale;
  context.drawImage(image, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
  return true;
}

function getIconFallback(icon: WheelSector["icon"]): string {
  return icon.type === "image" ? icon.fallback : icon.value;
}

function getSectorTextMaxWidth(sectorAngle: number, labelRadius: number): number {
  const chordWidth = 2 * labelRadius * Math.sin(sectorAngle / 2);
  return Math.max(42, Math.min(92, chordWidth * 0.72));
}

export function fitCanvasText(text: string, maxWidth: number, measureText: (value: string) => number): string {
  const normalized = text.trim();
  if (!normalized || maxWidth <= 0) {
    return "";
  }

  if (measureText(normalized) <= maxWidth) {
    return normalized;
  }

  const marker = "...";
  if (measureText(marker) > maxWidth) {
    return "";
  }

  let fitted = "";
  for (const char of Array.from(normalized)) {
    const next = `${fitted}${char}`;
    if (measureText(`${next}${marker}`) > maxWidth) {
      break;
    }
    fitted = next;
  }

  return fitted ? `${fitted}${marker}` : marker;
}

function drawWheelBackdrop(
  context: CanvasRenderingContext2D,
  center: Point,
  wheel: WheelConfig,
  backgroundImage: CanvasImageSource | null,
  renderMode: "preview" | "runtime",
) {
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

  if (renderMode === "preview") {
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
  }

  if (appearance.background.type === "image" && backgroundImage) {
    drawImageBackground(
      context,
      center,
      renderMode === "runtime" ? wheel.outerRadiusPx : radius,
      appearance.background.opacity,
      appearance.background.fit,
      backgroundImage,
    );
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

function drawImageBackground(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  opacity: number,
  fit: WheelConfig["appearance"]["background"]["fit"],
  image: CanvasImageSource,
) {
  const imageSize = getImageSize(image);
  if (!imageSize) {
    return;
  }

  const targetSize = radius * 2;
  const scale =
    fit === "contain"
      ? Math.min(targetSize / imageSize.width, targetSize / imageSize.height)
      : Math.max(targetSize / imageSize.width, targetSize / imageSize.height);
  const drawWidth = imageSize.width * scale;
  const drawHeight = imageSize.height * scale;
  const drawX = center.x - drawWidth / 2;
  const drawY = center.y - drawHeight / 2;

  context.save();
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.clip();
  context.globalAlpha = opacity;
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  context.restore();
}

function getImageSize(image: CanvasImageSource): { width: number; height: number } | null {
  if ("naturalWidth" in image && "naturalHeight" in image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  if ("width" in image && "height" in image && Number(image.width) > 0 && Number(image.height) > 0) {
    return {
      width: Number(image.width),
      height: Number(image.height),
    };
  }

  return null;
}

function getSectorFill(wheel: WheelConfig, renderMode: "preview" | "runtime"): string {
  const color = hexToRgb(wheel.appearance.backgroundColor);
  if (renderMode === "runtime") {
    switch (wheel.appearance.material) {
      case "transparent":
        return rgba(color, Math.min(0.34, wheel.appearance.opacity * 0.38));
      case "acrylic":
        return rgba(color, Math.min(0.64, wheel.appearance.opacity * 0.58));
      case "frosted":
        return rgba(color, Math.min(0.74, wheel.appearance.opacity * 0.68));
      case "solid":
        return rgba(color, 1);
    }
  }

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

function getCenterFill(wheel: WheelConfig, renderMode: "preview" | "runtime"): string {
  const color = hexToRgb(wheel.appearance.backgroundColor);
  if (renderMode === "runtime") {
    switch (wheel.appearance.material) {
      case "transparent":
        return rgba(color, Math.min(0.46, wheel.appearance.opacity * 0.52));
      case "acrylic":
        return rgba(color, Math.min(0.7, wheel.appearance.opacity * 0.68));
      case "frosted":
        return rgba(color, Math.min(0.8, wheel.appearance.opacity * 0.76));
      case "solid":
        return rgba(color, 1);
    }
  }

  return rgba(color, wheel.appearance.material === "solid" ? 1 : Math.max(0.72, wheel.appearance.opacity));
}

function getReadableTextColor(wheel: WheelConfig, renderMode: "preview" | "runtime"): string {
  const background = hexToRgb(wheel.appearance.backgroundColor);
  if (isTransparentRuntime(wheel, renderMode)) {
    return "#ffffff";
  }
  if (renderMode === "runtime" || wheel.appearance.material !== "transparent") {
    return relativeLuminance(background) < 0.45 ? "#f8fbff" : "#0f172a";
  }

  return "#dbe7ff";
}

function getCenterTextColor(wheel: WheelConfig, renderMode: "preview" | "runtime"): string {
  const background = hexToRgb(wheel.appearance.backgroundColor);
  if (isTransparentRuntime(wheel, renderMode)) {
    return "#ffffff";
  }
  if (renderMode === "runtime") {
    return relativeLuminance(background) < 0.45 ? "#dbe7ff" : "#1e293b";
  }

  return relativeLuminance(background) < 0.45 ? "#a9b8d4" : "#475569";
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

function isTransparentRuntime(wheel: WheelConfig, renderMode: "preview" | "runtime"): boolean {
  return renderMode === "runtime" && wheel.appearance.material === "transparent";
}

function applyTransparentTextShadow(context: CanvasRenderingContext2D) {
  context.shadowColor = "rgba(15, 23, 42, 0.86)";
  context.shadowBlur = 5;
  context.shadowOffsetY = 1;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgba(color: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha.toFixed(3)})`;
}
