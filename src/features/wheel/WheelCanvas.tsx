import { useEffect, useRef, useState } from "react";
import { drawWheel } from "./wheelRenderer";
import { getValidSectorIndex, type Point } from "./wheelGeometry";
import type { WheelConfig, WheelMenu } from "./wheelTypes";
import { getSectorPlacement } from "./sectorPlacement";

interface WheelCanvasProps {
  describedBy?: string;
  menu: WheelMenu;
  previewSectorIndex?: number | null;
  wheel: WheelConfig;
}

export function WheelCanvas({ describedBy, menu, previewSectorIndex = null, wheel }: WheelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef({ x: wheel.sizePx / 2, y: wheel.sizePx / 2 });
  const activeIndexRef = useRef<number | null>(null);
  const [activeSectorIndex, setActiveSectorIndex] = useState<number | null>(null);

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
  }, [menu, wheel]);

  useEffect(() => {
    if (previewSectorIndex === null || previewSectorIndex < 0 || previewSectorIndex >= menu.sectors.length) {
      return;
    }

    previewSector(previewSectorIndex);
  }, [menu.sectors.length, previewSectorIndex, wheel]);

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
    }
  }

  const safeActiveSectorIndex = getValidSectorIndex(activeSectorIndex, menu.sectors.length);
  const activeSector = safeActiveSectorIndex === null ? null : menu.sectors[safeActiveSectorIndex];
  const activePlacement =
    safeActiveSectorIndex === null ? null : getSectorPlacement(safeActiveSectorIndex, menu.sectors.length, wheel.startAngleDeg);
  const activeSectorText =
    activeSector && activePlacement
      ? `当前预览扇区：${activePlacement.accessibleLabel}，${activeSector.label}`
      : "当前没有选中扇区。";

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-describedby={describedBy}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End"
        aria-label={`轮盘预览，包含 ${menu.sectors.length} 个扇区`}
        aria-roledescription="可键盘预览的轮盘"
        className="wheel-preview__canvas"
        role="img"
        tabIndex={0}
        onKeyDown={handleKeyboardPreview}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          cursorRef.current = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          };
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
