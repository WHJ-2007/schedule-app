export type Theme = {
  n: number;
  name: string;
  desc: string;
  colors: string[];
  path: string;
};

export const THEMES: Theme[] = [
  { n: 1, name: "极简留白", desc: "大量留白 · 细线 · 克制的黑白灰", colors: ["#171717", "#525252", "#d4d4d4", "#2563eb", "#f5f5f5"], path: "/style-1" },
  { n: 6, name: "手账笔记本", desc: "横线纸 · 手写体 · 贴纸胶带", colors: ["#fbf6e9", "#4a3f35", "#e05a5a", "#4a7bb5", "#c9a961"], path: "/style-6" },
];

export const DEFAULT_THEME_PATH = "/style-1";
export const THEME_STORAGE_KEY = "schedule-theme";

export function getSavedThemePath(): string {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && THEMES.some((t) => t.path === raw)) return raw;
  } catch {
    // localStorage 不可用（隐私模式等）时回退默认
  }
  return DEFAULT_THEME_PATH;
}

export function saveThemePath(path: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, path);
  } catch {
    // 保存失败静默：下次进入仍为原主题
  }
}
