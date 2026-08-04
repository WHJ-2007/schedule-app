"use client";

import { useEffect, useRef, useState } from "react";
import { getChangelogPage, getChangelogPageCount } from "@/lib/changelog";
import { sanitizeImportedEvents } from "@/lib/events";
import type { ScheduleEvent } from "@/lib/events";

type Tab = "log" | "data";

export default function Settings({
  events,
  onImport,
}: {
  events: ScheduleEvent[];
  onImport: (list: ScheduleEvent[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("log");
  const [page, setPage] = useState(1);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // tab 切换：高亮块跟随选中按钮滑动（同月视图选中泡泡逻辑），内容区带缩放动画
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const el = bar.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab, open]);

  // 一键导出：全部日程序列化为 JSON 文件下载
  const exportAll = () => {
    const payload = JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), events },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `日程导出-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // 一键导入：读取 JSON 文件，清洗校验后整体替换
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const list = sanitizeImportedEvents(JSON.parse(String(reader.result)));
        if (list.length === 0) {
          setImportMsg("文件里没有可导入的日程数据");
          return;
        }
        onImport(list);
        setImportMsg(`已导入 ${list.length} 条日程`);
      } catch {
        setImportMsg("导入失败：文件不是有效的 JSON");
      }
    };
    reader.readAsText(file);
  };

  const pageCount = getChangelogPageCount();
  const entries = getChangelogPage(page);

  return (
    <>
      <button
        type="button"
        aria-label="打开设置"
        onClick={() => {
          setOpen(true);
          setPage(1);
        }}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/70 text-xl shadow-lg backdrop-blur transition hover:bg-white"
      >
        ⚙
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="设置"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm anim-fade-in"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/40 bg-white/70 p-6 shadow-xl max-h-[90vh] overflow-y-auto anim-scale-in backdrop-blur-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">设置</h2>
              <button
                type="button"
                aria-label="关闭设置"
                onClick={() => setOpen(false)}
                className="text-neutral-400 transition hover:text-neutral-900"
              >
                ✕
              </button>
            </div>
            <div
              ref={tabBarRef}
              className="relative mt-4 flex gap-2 border-b border-neutral-100 pb-3"
            >
              <div
                aria-hidden
                data-testid="tab-pill"
                className="absolute bottom-3 top-0 rounded-full bg-neutral-900 transition-all duration-200 ease-out"
                style={{ left: pill.left, width: pill.width, opacity: pill.width ? 1 : 0 }}
              />
              <button
                type="button"
                data-tab="log"
                onClick={() => setTab("log")}
                className={
                  "relative z-10 rounded-full px-4 py-1.5 text-sm transition " +
                  (tab === "log" ? "text-white" : "text-neutral-500 hover:bg-neutral-100")
                }
              >
                更新日志
              </button>
              <button
                type="button"
                data-tab="data"
                onClick={() => setTab("data")}
                className={
                  "relative z-10 rounded-full px-4 py-1.5 text-sm transition " +
                  (tab === "data" ? "text-white" : "text-neutral-500 hover:bg-neutral-100")
                }
              >
                数据
              </button>
            </div>

            <div key={tab} className="anim-scale-in">
            {tab === "log" ? (
              <div className="mt-4">
                {entries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-400">暂无日志</p>
                ) : (
                  <ul className="space-y-3">
                    {entries.map((e) => (
                      <li key={e.version} className="rounded-xl border border-neutral-200 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-neutral-900">{e.title}</span>
                          <span className="font-mono text-xs text-neutral-400">{e.version}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-400">{e.date}</p>
                        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs leading-5 text-neutral-600">
                          {e.changes.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="text-neutral-600 transition hover:text-neutral-900 disabled:text-neutral-300"
                  >
                    ‹ 上一页
                  </button>
                  <span className="text-xs text-neutral-500">
                    第 {page} / {pageCount} 页
                  </span>
                  <button
                    type="button"
                    disabled={page >= pageCount}
                    onClick={() => setPage(page + 1)}
                    className="text-neutral-600 transition hover:text-neutral-900 disabled:text-neutral-300"
                  >
                    下一页 ›
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={exportAll}
                  className="w-full rounded-xl border border-neutral-200 p-3 text-left transition hover:border-neutral-400"
                >
                  <span className="text-sm font-medium text-neutral-800">导出全部日程</span>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    保存为 JSON 文件（共 {events.length} 条日程）
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border border-neutral-200 p-3 text-left transition hover:border-neutral-400"
                >
                  <span className="text-sm font-medium text-neutral-800">导入日程</span>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    从 JSON 文件恢复，覆盖当前全部日程
                  </p>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportFile(f);
                    e.target.value = "";
                  }}
                />
                {importMsg && <p className="text-xs text-neutral-500">{importMsg}</p>}
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
