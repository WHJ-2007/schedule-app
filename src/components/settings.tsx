"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES, saveThemePath, getSavedThemePath } from "@/lib/themes";
import { getChangelogPage, getChangelogPageCount } from "@/lib/changelog";
import { sanitizeImportedEvents } from "@/lib/events";
import type { ScheduleEvent } from "@/lib/events";

type Tab = "theme" | "log" | "data";

export default function Settings({
  events,
  onImport,
}: {
  events: ScheduleEvent[];
  onImport: (list: ScheduleEvent[]) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("theme");
  const [page, setPage] = useState(1);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const current = getSavedThemePath();
  const pageCount = getChangelogPageCount();
  const entries = getChangelogPage(page);

  const pickTheme = (path: string) => {
    saveThemePath(path);
    router.push(path);
  };

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
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto anim-scale-in"
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
            <div className="mt-4 flex gap-2 border-b border-neutral-100 pb-3">
              <button
                type="button"
                onClick={() => setTab("theme")}
                className={
                  "rounded-full px-4 py-1.5 text-sm transition " +
                  (tab === "theme"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-500 hover:bg-neutral-100")
                }
              >
                主题
              </button>
              <button
                type="button"
                onClick={() => setTab("log")}
                className={
                  "rounded-full px-4 py-1.5 text-sm transition " +
                  (tab === "log"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-500 hover:bg-neutral-100")
                }
              >
                更新日志
              </button>
              <button
                type="button"
                onClick={() => setTab("data")}
                className={
                  "rounded-full px-4 py-1.5 text-sm transition " +
                  (tab === "data"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-500 hover:bg-neutral-100")
                }
              >
                数据
              </button>
            </div>

            {tab === "theme" ? (
              <ul className="mt-4 space-y-2">
                {THEMES.map((t) => {
                  const active = t.path === current;
                  return (
                    <li key={t.n}>
                      <button
                        type="button"
                        onClick={() => pickTheme(t.path)}
                        className={
                          "w-full rounded-xl border p-3 text-left transition " +
                          (active
                            ? "border-neutral-900 bg-neutral-50"
                            : "border-neutral-200 hover:border-neutral-400")
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className={"text-sm font-medium " + (active ? "text-neutral-900" : "text-neutral-700")}>
                            {t.name}
                          </span>
                          {active && <span className="text-xs text-neutral-500">当前</span>}
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">{t.desc}</p>
                        <div className="mt-2 flex gap-1.5">
                          {t.colors.map((c) => (
                            <span
                              key={c}
                              className="h-3.5 w-3.5 rounded-full border border-black/10"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : tab === "log" ? (
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
      )}
    </>
  );
}
