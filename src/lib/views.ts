export type ViewMode = "week" | "month" | "year";

export const VIEW_STORAGE_KEY = "schedule-view";
export const DEFAULT_VIEW: ViewMode = "month";
const VIEW_MODES: ViewMode[] = ["week", "month", "year"];

export function getSavedView(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw && (VIEW_MODES as string[]).includes(raw)) return raw as ViewMode;
  } catch {
    // localStorage 不可用（隐私模式等）
  }
  return DEFAULT_VIEW;
}

export function saveView(view: ViewMode): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // 保存失败静默忽略
  }
}
