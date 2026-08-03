export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "20260803-2153",
    date: "2026-08-03",
    title: "周/月/年视图与全局动画",
    changes: [
      "新增周/月/年视图切换器，记住上次选择",
      "周视图：7 天列布局，点事件直接编辑，点日期跳月视图",
      "年视图：12 个迷你月历，点月份/日期跳月视图",
      "抽取共享日程组件，5 个主题页改为令牌驱动的薄壳",
      "全局适度动画：视图切换、弹窗、列表、设置面板，支持系统减弱动态效果",
      "主题精简为 2 个（极简留白/手账笔记本），删除玻璃拟态、商务专业、现代渐变",
      "全局按钮反馈动画：悬停轻微放大、按下收缩",
      "月历选中日期改为滑动高亮泡泡：切换日期时平滑移动到新位置（类似 Excel 选区框）",
      "月视图/年视图翻页动画：下月/下一年内容从右滑入、上月/上一年从左滑入，两主题一致",
      "周视图改为时间轴：左侧 24 小时纵轴，事件按起止时间显示为区块",
      "周视图时间轴支持鼠标拖选时间段新建日程：按下拖动高亮选中，松开弹窗预填起止时间",
      "事件新增结束时间字段：拖选/手动填写均可，未填结束时间的事件按 1 小时显示",
      "全天事件（无时间）显示在周视图列头下的全天区",
      "周视图标题改为「年月周」顺序：如 2026年8月 第2周",
      "周视图翻周动画：下一周从右滑入、上一周从左滑入，年月周标题跟随滑动（与月/年视图一致）",
      "翻页动画仅作用于日期区域：月/周/年切换时标题与导航按钮不动，只有日期网格/时间轴滑动",
      "周视图时间轴默认折叠凌晨 1:00–6:00：显示为折叠条（含该时段日程数量），点击展开/收起",
    ],
  },
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
