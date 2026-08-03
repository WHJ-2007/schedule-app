"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

type Pos = { x: number; y: number; w: number; h: number };

/**
 * 月历选中高亮泡泡：网格上的绝对定位浮层，跟随选中日期平滑滑动（类似 Excel 选区框）。
 * 每次渲染后测量 `[data-selected]` 元素的位置并更新 transform；首次放置不播动画。
 */
export default function SelectionBubble({
  gridRef,
  className,
  label,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  className: string;
  label: number;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [animate, setAnimate] = useState(false);

  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const el = grid.querySelector<HTMLElement>("[data-selected]");
    if (!el) {
      setPos(null);
      return;
    }
    const g = grid.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const next = { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
    setPos((prev) =>
      prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
        ? prev
        : next
    );
  }, [gridRef]);

  useLayoutEffect(() => {
    measure();
  });

  // 首次放置后开启过渡，避免初始从角落滑入
  useLayoutEffect(() => {
    if (!pos) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [pos]);

  // 网格尺寸变化（窗口缩放等）时重新对齐
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [measure, gridRef]);

  return (
    <div
      aria-hidden
      data-testid="selection-bubble"
      className={className}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: pos?.w,
        height: pos?.h,
        transform: pos ? `translate(${pos.x}px, ${pos.y}px)` : undefined,
        transition: animate && pos ? "transform 200ms ease-out" : "none",
        visibility: pos ? "visible" : "hidden",
        pointerEvents: "none",
      }}
    >
      {pos ? label : ""}
    </div>
  );
}
