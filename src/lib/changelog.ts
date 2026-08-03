export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "20260803-1958",
    date: "2026-08-03",
    title: "主题精简与设置面板",
    changes: [
      "主题精简为 5 个（极简留白/玻璃拟态/商务专业/手账/现代渐变），删除深色霓虹与马卡龙清新",
      "进入系统自动打开上次使用的主题，首次默认极简留白",
      "新增设置面板：切换主题",
      "新增设置面板：版本更新日志，支持分页浏览",
    ],
  },
];

export const LOG_PAGE_SIZE = 5;

export function getChangelogPageCount(): number {
  return Math.max(1, Math.ceil(CHANGELOG.length / LOG_PAGE_SIZE));
}

export function getChangelogPage(page: number): ChangelogEntry[] {
  const start = (page - 1) * LOG_PAGE_SIZE;
  if (start < 0 || start >= CHANGELOG.length) return [];
  return CHANGELOG.slice(start, start + LOG_PAGE_SIZE);
}
