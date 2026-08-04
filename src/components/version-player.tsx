"use client";

import type { HistoryEntry } from "@/lib/use-events";

export default function VersionPlayer({
  history,
  index,
  onJump,
  onClose,
}: {
  history: HistoryEntry[];
  index: number;
  onJump: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="版本播放"
      className="absolute bottom-full right-0 z-50 mb-2 w-80 rounded-xl border border-white/40 bg-white/70 p-4 shadow-xl backdrop-blur-xl anim-scale-in"
    >
      <button
        type="button"
        aria-label="关闭版本播放"
        onClick={onClose}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
      >
        ✕
      </button>
      {history.length <= 1 ? (
        <p className="py-6 text-center text-sm text-neutral-500">暂无历史操作</p>
      ) : (
        <>
          <div className="pr-8">
            <input
              type="range"
              min={0}
              max={history.length - 1}
              value={index}
              aria-label="版本时间轴"
              onChange={(e) => onJump(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <p className="mt-2 text-center text-xs text-neutral-500">
            第 {index + 1} / {history.length} 版 ·{" "}
            {new Date(history[index].at).toLocaleTimeString("zh-CN", { hour12: false })}
          </p>
        </>
      )}
    </div>
  );
}
