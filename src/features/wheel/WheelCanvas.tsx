import { useEffect, useRef } from "react";
import { drawWheel } from "./wheelRenderer";
import type { WheelConfig, WheelMenu } from "./wheelTypes";

interface WheelCanvasProps {
  menu: WheelMenu;
  wheel: WheelConfig;
}

export function WheelCanvas({ menu, wheel }: WheelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef({ x: wheel.sizePx / 2, y: wheel.sizePx / 2 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let animationId = 0;
    const center = { x: wheel.sizePx / 2, y: wheel.sizePx / 2 };

    const render = () => {
      drawWheel({
        canvas,
        center,
        cursor: cursorRef.current,
        menu,
        wheel,
      });
      animationId = window.requestAnimationFrame(render);
    };

    animationId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationId);
  }, [menu, wheel]);

  return (
    <canvas
      ref={canvasRef}
      className="wheel-preview__canvas"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        cursorRef.current = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }}
    />
  );
}
