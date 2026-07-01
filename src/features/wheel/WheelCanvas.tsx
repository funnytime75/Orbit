import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { drawWheel } from "./wheelRenderer";
import { getActiveSectorIndex, getDirectionalSectorIndex, getValidSectorIndex, type Point } from "./wheelGeometry";
import type { WheelConfig, WheelMenu } from "./wheelTypes";
import { getSectorPlacement } from "./sectorPlacement";
import { loadBackgroundImage } from "../../shared/ipc/commands";

type DirectionalTrigger = {
  enabled: boolean;
  quickLaunch: boolean;
  moveThresholdPx: number;
  token: number;
};

interface WheelCanvasProps {
  describedBy?: string;
  directionalTrigger?: DirectionalTrigger;
  focusToken?: number;
  menu: WheelMenu;
  onBackgroundImageStatusChange?: (status: { imagePath: string; status: "failed" | "loaded" }) => void;
  onActiveSectorChange?: (sectorId: string | null) => void;
  onCancel?: () => void;
  onSelectSector?: (sectorId: string) => void;
  previewSectorIndex?: number | null;
  renderMode?: "preview" | "runtime";
  runtimeCursor?: Point | null;
  wheel: WheelConfig;
}

export function WheelCanvas({
  describedBy,
  directionalTrigger,
  focusToken,
  menu,
  onBackgroundImageStatusChange,
  onActiveSectorChange,
  onCancel,
  onSelectSector,
  previewSectorIndex = null,
  renderMode = "preview",
  runtimeCursor = null,
  wheel,
}: WheelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef({ x: wheel.sizePx / 2, y: wheel.sizePx / 2 });
  const activeIndexRef = useRef<number | null>(null);
  const directionalLaunchTokenRef = useRef<number | null>(null);
  const [activeSectorIndex, setActiveSectorIndex] = useState<number | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [iconImages, setIconImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const isRuntimeSession = renderMode === "runtime" && runtimeCursor !== null;
  const isInteractive = renderMode !== "runtime" || !isRuntimeSession;
  const directionalTriggerEnabled = directionalTrigger?.enabled === true;
  const directionalQuickLaunch = directionalTrigger?.quickLaunch === true;
  const directionalTriggerMoveThresholdPx = directionalTrigger?.moveThresholdPx ?? 0;
  const directionalTriggerToken = directionalTrigger?.token ?? 0;
  const imageIconSectors = useMemo(
    () => {
      const sectors: Array<{ id: string; source: string }> = [];
      for (const sector of menu.sectors) {
        if (sector.icon.type === "image") {
          sectors.push({ id: sector.id, source: sector.icon.source });
        }
      }
      return sectors;
    },
    [menu.sectors],
  );

  useEffect(() => {
    if (focusToken === undefined || !isInteractive) {
      return;
    }

    canvasRef.current?.focus();
  }, [focusToken, isInteractive]);

  useEffect(() => {
    if (!directionalTriggerEnabled) {
      return;
    }

    directionalLaunchTokenRef.current = directionalTriggerToken;
    resetCursorToCenter();
  }, [directionalTriggerEnabled, directionalTriggerToken, wheel.sizePx]);

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
        iconImages,
        menu,
        renderMode,
        backgroundImage,
        wheel,
      });
      if (directionalTriggerEnabled && directionalQuickLaunch && directionalLaunchTokenRef.current === null) {
        animationId = window.requestAnimationFrame(render);
        return;
      }
      if (activeIndexRef.current !== activeIndex) {
        activeIndexRef.current = activeIndex;
        setActiveSectorIndex(activeIndex);
        onActiveSectorChange?.(getSectorId(activeIndex, menu));
      }
      animationId = window.requestAnimationFrame(render);
    };

    animationId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationId);
  }, [backgroundImage, directionalQuickLaunch, directionalTriggerEnabled, iconImages, menu, onActiveSectorChange, renderMode, wheel]);

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
    if (imageIconSectors.length === 0) {
      setIconImages(new Map());
      return;
    }

    let disposed = false;
    const nextImages = new Map<string, HTMLImageElement>();
    const images: HTMLImageElement[] = [];

    for (const sector of imageIconSectors) {
      const image = new Image();
      images.push(image);
      image.decoding = "async";
      image.onload = () => {
        if (disposed) {
          return;
        }

        nextImages.set(sector.id, image);
        setIconImages(new Map(nextImages));
      };
      image.onerror = () => {
        if (disposed) {
          return;
        }

        nextImages.delete(sector.id);
        setIconImages(new Map(nextImages));
      };
      image.src = sector.source;
    }

    return () => {
      disposed = true;
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [imageIconSectors]);

  useEffect(() => {
    if (previewSectorIndex === null) {
      resetCursorToCenter();
      return;
    }
    if (previewSectorIndex < 0 || previewSectorIndex >= menu.sectors.length) {
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

  function resetCursorToCenter() {
    cursorRef.current = { x: wheel.sizePx / 2, y: wheel.sizePx / 2 };
    activeIndexRef.current = null;
    setActiveSectorIndex(null);
    onActiveSectorChange?.(null);
  }

  function previewSector(index: number) {
    cursorRef.current = getSectorPreviewPoint(index, menu.sectors.length, wheel);
    activeIndexRef.current = index;
    setActiveSectorIndex(index);
    onActiveSectorChange?.(getSectorId(index, menu));
  }

  function getSectorIndexAtPoint(point: Point): number | null {
    const center = { x: wheel.sizePx / 2, y: wheel.sizePx / 2 };
    const selectedIndex = getActiveSectorIndex(
      center,
      point,
      menu.sectors.length,
      wheel.startAngleDeg,
      wheel.innerRadiusPx,
      wheel.outerRadiusPx,
    );
    return getValidSectorIndex(selectedIndex, menu.sectors.length);
  }

  function previewSectorAtPoint(point: Point): number | null {
    const selectedIndex = getSectorIndexAtPoint(point);
    activeIndexRef.current = selectedIndex;
    setActiveSectorIndex(selectedIndex);
    onActiveSectorChange?.(getSectorId(selectedIndex, menu));
    return selectedIndex;
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
      onCancel?.();
      return;
    }

    onSelectSector?.(menu.sectors[selectedIndex].id);
  }

  function selectSectorAtPoint(point: Point) {
    const safeSelectedIndex = previewSectorAtPoint(point);
    if (safeSelectedIndex === null) {
      onCancel?.();
      return;
    }

    cursorRef.current = getSectorPreviewPoint(safeSelectedIndex, menu.sectors.length, wheel);
    activeIndexRef.current = safeSelectedIndex;
    setActiveSectorIndex(safeSelectedIndex);
    onSelectSector?.(menu.sectors[safeSelectedIndex].id);
  }

  function previewOrSelectSectorByDirection(point: Point) {
    if (!directionalTriggerEnabled || !directionalQuickLaunch) {
      return;
    }

    const center = { x: wheel.sizePx / 2, y: wheel.sizePx / 2 };
    const selectedIndex = getDirectionalSectorIndex(
      center,
      point,
      menu.sectors.length,
      wheel.startAngleDeg,
      directionalTriggerMoveThresholdPx,
    );
    const safeSelectedIndex = getValidSectorIndex(selectedIndex, menu.sectors.length);
    if (safeSelectedIndex === null) {
      activeIndexRef.current = null;
      setActiveSectorIndex(null);
      onActiveSectorChange?.(null);
      return;
    }

    activeIndexRef.current = safeSelectedIndex;
    setActiveSectorIndex(safeSelectedIndex);
    onActiveSectorChange?.(getSectorId(safeSelectedIndex, menu));

    if (directionalLaunchTokenRef.current !== directionalTriggerToken) {
      return;
    }

    directionalLaunchTokenRef.current = null;
    onSelectSector?.(menu.sectors[safeSelectedIndex].id);
  }

  function getCanvasPoint(event: React.MouseEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = rect.width > 0 ? wheel.sizePx / rect.width : 1;
    const scaleY = rect.height > 0 ? wheel.sizePx / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
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
        onMouseLeave={() => {
          if (isInteractive) {
            resetCursorToCenter();
          }
        }}
        onMouseMove={(event) => {
          if (!isInteractive) {
            return;
          }

          const point = getCanvasPoint(event);
          cursorRef.current = point;
          if (directionalQuickLaunch) {
            previewOrSelectSectorByDirection(point);
            return;
          }

          previewSectorAtPoint(point);
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

function getSectorId(index: number | null, menu: WheelMenu): string | null {
  if (index === null || index < 0 || index >= menu.sectors.length) {
    return null;
  }

  return menu.sectors[index]?.id ?? null;
}
