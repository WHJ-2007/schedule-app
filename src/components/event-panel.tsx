"use client";

import type { RepeatFreq } from "@/lib/events";
import { parseTimeToMinutes, minutesToTime } from "@/lib/date";
import { EVENT_COLORS } from "@/lib/colors";
import type { ThemeTokens } from "./theme-tokens";

export type FormState = {
  id: string | null;
  dates: string[]; // 新建时可同时添加到多个日期（横向拖拽）
  title: string;
  time: string;
  endTime: string;
  endDate: string; // 全天事件跨至日期（含，空 = 仅当天）
  description: string;
  repeat: { on: boolean; freq: RepeatFreq | ""; until: string }; // 开关 + 频率 + 重复至；关闭 = 不重复
  color: string; // 自定义颜色（空 = 默认，跟随主题）
};

export function emptyForm(dates: string[]): FormState {
  return {
    id: null,
    dates,
    title: "",
    time: "",
    endTime: "",
    endDate: "",
    description: "",
    repeat: { on: false, freq: "", until: "" },
    color: "",
  };
}

const REPEAT_OPTIONS: { value: RepeatFreq; label: string }[] = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "weekday", label: "工作日（周一至周五）" },
  { value: "weekend", label: "周末（周六、周日）" },
];

// 编辑面板：新建/编辑统一入口。默认右侧滑入；inline 模式填充父容器（月视图看板式内嵌）
export default function EventPanel({
  form,
  tokens,
  onChange,
  onSave,
  onDelete,
  onClose,
  inline = false,
  canEndEarly = false,
  onEndEarly,
}: {
  form: FormState;
  tokens: ThemeTokens;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  inline?: boolean;
  canEndEarly?: boolean; // 日程正在进行的时段：才显示「提前结束」（只标记完成，计划不变）
  onEndEarly?: () => void;
}) {
  const { dialog } = tokens;
  const minutesOf = (t: string) => (t ? parseTimeToMinutes(t) : NaN);
  // 当前时长（结束 − 开始，缺省 60 分钟，最短 15 分钟）
  const curDuration = (f: FormState) => {
    const s = minutesOf(f.time);
    const en = minutesOf(f.endTime);
    return isNaN(s) || isNaN(en) ? 60 : Math.max(15, en - s);
  };
  return (
    <div
      role="dialog"
      aria-label={form.id ? "编辑日程" : "添加日程"}
      className={
        inline
          ? "anim-fade-in flex min-h-0 flex-1 flex-col"
          : "anim-panel-in fixed inset-y-0 right-0 z-50 flex w-80 max-w-[92vw] flex-col border-l border-white/40 bg-white/70 shadow-xl backdrop-blur-xl"
      }
    >
      <div
        className={
          "flex items-center justify-between border-b border-neutral-100 " +
          (inline ? "pb-3" : "px-5 py-4")
        }
      >
        <h3 className={dialog.title}>{form.id ? "编辑日程" : "添加日程"}</h3>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="text-neutral-400 transition hover:scale-105 hover:text-neutral-900"
        >
          ✕
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className={"flex min-h-0 flex-1 flex-col " + (inline ? "" : dialog.bodyClass)}
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
          {/* 三输入等分网格：min-w-0 允许收缩，避免窄面板横向溢出（结束时间/色板被滚动切掉） */}
          <div className="grid grid-cols-3 gap-2">
            <label htmlFor="time" className="block min-w-0">
              <span className={dialog.inputLabel}>开始时间</span>
              <input
                id="time"
                type="time"
                value={form.time}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return onChange({ ...form, time: v, endDate: "" });
                  // 改开始：结束 = 开始 + 当前时长（时长保持）；定时事件不再跨天
                  onChange({
                    ...form,
                    time: v,
                    endDate: "",
                    endTime: minutesToTime(Math.min(1439, minutesOf(v) + curDuration(form))),
                  });
                }}
                className={dialog.input + " min-w-0"}
              />
            </label>
            <label htmlFor="duration" className="block min-w-0">
              <span className={dialog.inputLabel}>时长</span>
              <input
                id="duration"
                type="time"
                aria-label="时长"
                value={minutesToTime(curDuration(form))}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const dur = parseTimeToMinutes(v);
                  if (!form.time) return onChange({ ...form, endTime: v });
                  // 改时长：结束 = 开始 + 时长（开始不动，结束钳制 23:59）
                  onChange({
                    ...form,
                    endTime: minutesToTime(Math.min(1439, minutesOf(form.time) + dur)),
                  });
                }}
                className={dialog.input + " min-w-0"}
              />
            </label>
            <label htmlFor="endTime" className="block min-w-0">
              <span className={dialog.inputLabel}>结束时间</span>
              <input
                id="endTime"
                type="time"
                value={form.endTime}
                onChange={(e) => onChange({ ...form, endTime: e.target.value })}
                className={dialog.input + " min-w-0"}
              />
            </label>
          </div>
          {!form.time && (
            <label htmlFor="endDate" className="block">
              <span className={dialog.inputLabel}>跨至日期（全天，留空 = 仅当天）</span>
              <input
                id="endDate"
                type="date"
                min={form.dates[0]}
                value={form.endDate}
                onChange={(e) => onChange({ ...form, endDate: e.target.value })}
                className={dialog.input}
              />
            </label>
          )}
          <div>
            <span className={dialog.inputLabel}>颜色</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`颜色 ${c}`}
                  onClick={() => onChange({ ...form, color: c })}
                  className={
                    "h-6 w-6 rounded-full border border-black/10 transition " +
                    (form.color === c
                      ? "ring-2 ring-neutral-900 ring-offset-1"
                      : "hover:scale-110")
                  }
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                type="button"
                aria-label="颜色 默认"
                onClick={() => onChange({ ...form, color: "" })}
                className={
                  "h-6 w-6 rounded-full border border-dashed border-neutral-400 text-[10px] leading-none text-neutral-500 transition " +
                  (form.color === ""
                    ? "ring-2 ring-neutral-900 ring-offset-1"
                    : "hover:scale-110")
                }
              >
                默
              </button>
            </div>
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
                <div className="grid grid-cols-2 gap-2">
                  <label htmlFor="repeatStart" className="block min-w-0">
                    <span className={dialog.inputLabel}>重复开始</span>
                    <input
                      id="repeatStart"
                      type="date"
                      value={form.dates[0]}
                      onChange={(e) =>
                        onChange({ ...form, dates: [e.target.value, ...form.dates.slice(1)] })
                      }
                      className={dialog.input + " min-w-0"}
                    />
                  </label>
                  <label htmlFor="repeatUntil" className="block min-w-0">
                    <span className={dialog.inputLabel}>重复至</span>
                    <input
                      id="repeatUntil"
                      type="date"
                      value={form.repeat.until}
                      onChange={(e) =>
                        onChange({ ...form, repeat: { ...form.repeat, until: e.target.value } })
                      }
                      className={dialog.input + " min-w-0"}
                    />
                  </label>
                </div>
                <p className="text-xs text-neutral-400">重复开始默认为所选日期的开始日；重复至留空表示无限重复</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <div className="flex items-center gap-3">
            {canEndEarly && onEndEarly && (
              <button
                type="button"
                onClick={onEndEarly}
                className="text-sm text-blue-600 transition hover:scale-[1.03] hover:text-blue-800"
              >
                提前结束
              </button>
            )}
            {form.id && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(form.id!)}
                className="text-sm text-red-500 transition hover:scale-[1.03] hover:text-red-700"
              >
                删除
              </button>
            ) : (
              <span />
            )}
          </div>
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
