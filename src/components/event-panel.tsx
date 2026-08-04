"use client";

import type { RepeatFreq } from "@/lib/events";
import type { ThemeTokens } from "./theme-tokens";

export type FormState = {
  id: string | null;
  dates: string[]; // 新建时可同时添加到多个日期（横向拖拽）
  title: string;
  time: string;
  endTime: string;
  description: string;
  repeat: { on: boolean; freq: RepeatFreq | ""; until: string }; // 开关 + 频率 + 重复至；关闭 = 不重复
};

export function emptyForm(dates: string[]): FormState {
  return {
    id: null,
    dates,
    title: "",
    time: "",
    endTime: "",
    description: "",
    repeat: { on: false, freq: "", until: "" },
  };
}

const REPEAT_OPTIONS: { value: RepeatFreq; label: string }[] = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "weekday", label: "工作日（周一至周五）" },
  { value: "weekend", label: "周末（周六、周日）" },
];

// 右侧滑入的编辑面板：新建/编辑统一入口，替代原居中弹窗
export default function EventPanel({
  form,
  tokens,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  form: FormState;
  tokens: ThemeTokens;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const { dialog } = tokens;
  return (
    <div
      role="dialog"
      aria-label={form.id ? "编辑日程" : "添加日程"}
      className="anim-panel-in fixed inset-y-0 right-0 z-50 flex w-80 max-w-[92vw] flex-col border-l border-neutral-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
        <h3 className={dialog.title}>{form.id ? "编辑日程" : "添加日程"}</h3>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="text-neutral-400 transition hover:text-neutral-900"
        >
          ✕
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className={"flex min-h-0 flex-1 flex-col " + dialog.bodyClass}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {form.dates.length > 1 && (
            <p className={dialog.inputLabel + " mt-1"}>
              将同时添加到 {form.dates.length} 天：
              {form.dates.map((d) => `${d.slice(5).replace("-", "月")}日`).join("、")}
            </p>
          )}
          <label htmlFor="title" className="block">
            <span className={dialog.inputLabel}>标题</span>
            <input
              id="title"
              autoFocus
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              placeholder="日程标题"
              className={dialog.input}
            />
          </label>
          <div className="flex gap-3">
            <label htmlFor="time" className="block flex-1">
              <span className={dialog.inputLabel}>开始时间</span>
              <input
                id="time"
                type="time"
                value={form.time}
                onChange={(e) => onChange({ ...form, time: e.target.value })}
                className={dialog.input}
              />
            </label>
            <label htmlFor="endTime" className="block flex-1">
              <span className={dialog.inputLabel}>结束时间</span>
              <input
                id="endTime"
                type="time"
                value={form.endTime}
                onChange={(e) => onChange({ ...form, endTime: e.target.value })}
                className={dialog.input}
              />
            </label>
          </div>
          <label htmlFor="description" className="block">
            <span className={dialog.inputLabel}>描述</span>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              rows={3}
              className={dialog.input + " resize-none"}
            />
          </label>

          {/* 重复开关：勾选后展开频率与起止选项 */}
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.repeat.on}
                onChange={(e) =>
                  onChange({
                    ...form,
                    repeat: {
                      ...form.repeat,
                      on: e.target.checked,
                      freq: e.target.checked ? form.repeat.freq || "daily" : "",
                    },
                  })
                }
                aria-label="重复"
                className="accent-blue-600"
              />
              <span className={dialog.inputLabel}>重复</span>
            </label>
            {form.repeat.on && (
              <div className="space-y-3 rounded-lg border border-neutral-100 p-3 anim-fade-in">
                <label htmlFor="repeatFreq" className="block">
                  <span className={dialog.inputLabel}>频率</span>
                  <select
                    id="repeatFreq"
                    value={form.repeat.freq}
                    onChange={(e) =>
                      onChange({
                        ...form,
                        repeat: { ...form.repeat, freq: e.target.value as RepeatFreq | "" },
                      })
                    }
                    className={dialog.input}
                  >
                    {REPEAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-3">
                  <label htmlFor="repeatStart" className="block flex-1">
                    <span className={dialog.inputLabel}>重复开始</span>
                    <input
                      id="repeatStart"
                      type="date"
                      value={form.dates[0]}
                      onChange={(e) =>
                        onChange({ ...form, dates: [e.target.value, ...form.dates.slice(1)] })
                      }
                      className={dialog.input}
                    />
                  </label>
                  <label htmlFor="repeatUntil" className="block flex-1">
                    <span className={dialog.inputLabel}>重复至</span>
                    <input
                      id="repeatUntil"
                      type="date"
                      value={form.repeat.until}
                      onChange={(e) =>
                        onChange({ ...form, repeat: { ...form.repeat, until: e.target.value } })
                      }
                      className={dialog.input}
                    />
                  </label>
                </div>
                <p className="text-xs text-neutral-400">重复开始默认为所选日期的开始日；重复至留空表示无限重复</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          {form.id && onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(form.id!)}
              className="text-sm text-red-500 transition hover:text-red-700"
            >
              删除
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={dialog.cancel}>
              取消
            </button>
            <button type="submit" className={dialog.save}>
              保存
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
