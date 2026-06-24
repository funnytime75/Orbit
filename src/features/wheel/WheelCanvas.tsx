import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { drawWheel } from "./wheelRenderer";
import { getActiveSectorIndex, getValidSectorIndex, type Point } from "./wheelGeometry";
import type { WheelConfig, WheelMenu } from "./wheelTypes";
import { getSectorPlacement } from "./sectorPlacement";
import { loadBackgroundImage } from "../../shared/ipc/commands";

interface WheelCanvasProps {
  describedBy?: string;
  focusToken?: number;
  menu: WheelMenu;
  onBackgroundImageStatusChange?: (status: { imagePath: string; status: "failed" | "loaded" }) => void;
  onSelectSector?: (sectorId: string) => void;
  previewSectorIndex?: number | null;
  renderMode?: "preview" | "runtime";
  runtimeCursor?: Point | null;
  wheel: WheelConfig;
}

export function WheelCanvas({
  describedBy,
  focusToken,
  menu,
  onBackgroundImageStatusChange,
  onSelectSector,
  previewSectorIndex = null,
  renderMode = "preview",
  runtimeCursor = null,
  wheel,
}: WheelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef({ x: wheel.sizePx / 2, y: wheel.sizePx / 2 });
  const activeIndexRef = useRef<number | null>(null);
  const [activeSectorIndex, setActiveSectorIndex] = useState<number | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const isRuntimeSession = renderMode === "runtime" && runtimeCursor !== null;
  const isInteractive = renderMode !== "runtime" || !isRuntimeSession;

  useEffect(() => {
    if (focusToken === undefined || !isInteractive) {
      return;
    }

    canvasRef.current?.focus();
  }, [focusToken, isInteractive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let animationId = 0;
    const center = { x: wheel.sizePx / 2, y: wheel.sizePx / 2 };

    const render = () => {
      const activeIndex = drawWheel({
        canvas,
        center,
        cursor: cursorRef.current,
        menu,
        renderMode,
        backgroundImage,
        wheel,
      });
      if (activeIndexRef.current !== activeIndex) {
        activeIndexRef.current = activeIndex;
        setActiveSectorIndex(activeIndex);
      }
      animationId = window.requestAnimationFrame(render);
    };

    animationId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationId);
  }, [backgroundImage, menu, renderMode, wheel]);

  useEffect(() => {
    const background = wheel.appearance.background;
    if (background.type !== "image" || !background.imagePath?.trim()) {
      setBackgroundImage(null);
      return;
    }

    const imagePath = background.imagePath;
    let disposed = false;
    let image: HTMLImageElement | null = null;
    const loadImage = async () => {
      try {
        const source = isTauri() ? await loadBackgroundImage(imagePath) : imagePath;
        if (disposed) {
          return;
        }

        image = new Image();
        image.decoding = "async";
        image.onload = () => {
          if (!disposed) {
            setBackgroundImage(image);
            onBackgroundImageStatusChange?.({ imagePath, status: "loaded" });
          }
        };
        image.onerror = () => {
          if (!disposed) {
            setBackgroundImage(null);
            onBackgroundImageStatusChange?.({ imagePath, status: "failed" });
          }
        };
        image.src = source;
      } catch {
        if (!disposed) {
          setBackgroundImage(null);
          onBackgroundImageStatusChange?.({ imagePath, status: "failed" });
        }
      }
    };

    void loadImage();

    return () => {
      disposed = true;
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [onBackgroundImageStatusChange, wheel.appearance.background.imagePath, wheel.appearance.background.type]);

  useEffect(() => {
    if (previewSectorIndex === null || previewSectorIndex < 0 || previewSectorIndex >= menu.sectors.length) {
      return;
    }

    previewSector(previewSectorIndex);
  }, [menu.sectors.length, previewSectorIndex, wheel]);

  useEffect(() => {
    if (!isRuntimeSession || !runtimeCursor) {
      return;
    }

    cursorRef.current = runtimeCursor;
  }, [isRuntimeSession, runtimeCursor]);

  useEffect(() => {
    if (activeIndexRef.current === null || activeIndexRef.current < menu.sectors.length) {
      return;
    }

    activeIndexRef.current = null;
    setActiveSectorIndex(null);
    cursorRef.current = { x: wheel.sizePx / 2, y: wheel.sizePx / 2 };
  }, [menu.sectors.length, wheel.sizePx]);

  function previewSector(index: number) {
    cursorRef.current = getSectorPreviewPoint(index, menu.sectors.length, wheel);
    activeIndexRef.current = index;
    setActiveSectorIndex(index);
  }

  function handleKeyboardPreview(event: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!isInteractive) {
      return;
    }

    if (menu.sectors.length === 0) {
      return;
    }

    const currentIndex = activeIndexRef.current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      previewSector(currentIndex === null ? 0 : (currentIndex + 1) % menu.sectors.length);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      previewSector(currentIndex === null ? menu.sectors.length - 1 : (currentIndex - 1 + menu.sectors.length) % menu.sectors.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      previewSector(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      previewSector(menu.sectors.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectActiveSector();
    }
  }

  function selectActiveSector() {
    const selectedIndex = getValidSectorIndex(activeIndexRef.current, menu.sectors.length);
    if (selectedIndex === null) {
      return;
    }

    onSelectSector?.(menu.sectors[selectedIndex].id);
  }

  function selectSectorAtPoint(point: Point) {
    const center = { x: wheel.sizePx / 2, y: wheel.sizePx / 2 };
    const selectedIndex = getActiveSectorIndex(center, point, menu.sectors.length, wheel.startAngleDeg, wheel.innerRadiusPx);
    const safeSelectedIndex = getValidSectorIndex(selectedIndex, menu.sectors.length);
    if (safeSelectedIndex === null) {
      return;
    }

    activeIndexRef.current = safeSelectedIndex;
    setActiveSectorIndex(safeSelectedIndex);
    onSelectSector?.(menu.sectors[safeSelectedIndex].id);
  }

  function getCanvasPoint(event: React.MouseEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  const safeActiveSectorIndex = getValidSectorIndex(activeSectorIndex, menu.sectors.length);
  const activeSector = safeActiveSectorIndex === null ? null : menu.sectors[safeActiveSectorIndex];
  const activePlacement =
    safeActiveSectorIndex === null ? null : getSectorPlacement(safeActiveSectorIndex, menu.sectors.length, wheel.startAngleDeg);
  const activeSectorText =
    activeSector && activePlacement
      ? `当前预览扇区：${activePlacement.accessibleLabel}，${activeSector.label}`
      : "当前没有选中扇区。";
  const canvasRole = onSelectSector ? "button" : "img";
  const canvasLabel = onSelectSector
    ? `轮盘选择器，包含 ${menu.sectors.length} 个扇区。使用方向键选择扇区，按 Enter 或空格执行。`
    : `轮盘预览，包含 ${menu.sectors.length} 个扇区`;

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-describedby={describedBy}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space"
        aria-label={canvasLabel}
        aria-roledescription={onSelectSector ? "轮盘选择器" : "可键盘预览的轮盘"}
        className="wheel-preview__canvas"
        role={canvasRole}
        tabIndex={isInteractive ? 0 : -1}
        onClick={(event) => {
          if (isInteractive) {
            const point = getCanvasPoint(event);
            cursorRef.current = point;
            selectSectorAtPoint(point);
          }
        }}
        onKeyDown={handleKeyboardPreview}
        onMouseMove={(event) => {
          if (!isInteractive) {
            return;
          }

          cursorRef.current = getCanvasPoint(event);
        }}
      />
      <p className="sr-only" aria-live="polite">
        {activeSectorText}
      </p>
    </>
  );
}

function getSectorPreviewPoint(index: number, sectorCount: number, wheel: WheelConfig): Point {
  const center = { x: wheel.sizePx / 2, y: wheel.sizePx / 2 };
  const sectorAngle = (Math.PI * 2) / sectorCount;
  const startAngle = (wheel.startAngleDeg * Math.PI) / 180;
  const angle = startAngle + sectorAngle * index + sectorAngle / 2;
  const radius = (wheel.innerRadiusPx + wheel.outerRadiusPx) / 2;

  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}
