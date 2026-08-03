"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES, saveThemePath, getSavedThemePath } from "@/lib/themes";
import { getChangelogPage, getChangelogPageCount } from "@/lib/changelog";

type Tab = "theme" | "log";

export default function Settings() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("theme");
  const [page, setPage] = useState(1);

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[75vh] overflow-y-auto"
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
            ) : (
              <div className="mt-4">
                {entries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-400">暂无日志</p>
                ) : (
                  <ul className="space-y-4">
                    {entries.map((e) => (
                      <li key={e.version} className="rounded-xl border border-neutral-200 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-neutral-900">{e.title}</span>
                          <span className="font-mono text-xs text-neutral-400">{e.version}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-400">{e.date}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-neutral-600">
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
            )}
          </div>
        </div>
      )}
    </>
  );
}
