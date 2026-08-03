import { describe, it, expect } from "vitest";
import { THEME_TOKENS } from "./theme-tokens";

const REQUIRED_TOP = ["main", "header", "sectionTitle", "weekdayHeader", "navButton", "card", "button", "cell", "dot", "dotMore", "todayMark", "dayList", "dialog", "viewTab", "weekView", "yearView"] as const;

describe("theme tokens", () => {
  it("恰好覆盖 5 个保留主题", () => {
    expect(Object.keys(THEME_TOKENS).map(Number).sort()).toEqual([1, 2, 5, 6, 7]);
  });

  it.each([1, 2, 5, 6, 7])("主题 %i 的关键令牌非空", (n) => {
    const t = THEME_TOKENS[n];
    for (const key of REQUIRED_TOP) {
      expect(t[key], `tokens[${n}].${key}`).toBeDefined();
    }
    expect(t.main.length).toBeGreaterThan(0);
    expect(t.button.primary.length).toBeGreaterThan(0);
    expect(t.cell.selected.length).toBeGreaterThan(0);
    expect(t.viewTab.active.length).toBeGreaterThan(0);
    expect(t.weekView.columnHighlight.length).toBeGreaterThan(0);
    expect(t.yearView.monthCard.length).toBeGreaterThan(0);
  });

  it("头部标题文案齐全", () => {
    expect(String(THEME_TOKENS[1].header.title)).toContain("极简");
    expect(String(THEME_TOKENS[2].header.title)).toContain("玻璃");
    expect(String(THEME_TOKENS[5].header.title)).toContain("商务");
    expect(String(THEME_TOKENS[6].header.title)).toContain("手账");
    expect(String(THEME_TOKENS[7].header.title)).toContain("渐变");
  });

  it("主题 2 的可选令牌与页面结构一致", () => {
    expect(THEME_TOKENS[2].viewPanel).toBeDefined();
    expect(THEME_TOKENS[2].cell.indicatorPills).toBe(true);
    expect(THEME_TOKENS[2].cell.indicatorCap).toBe(2);
    expect(THEME_TOKENS[2].cell.indicatorArea).toContain("overflow-hidden");
    expect(THEME_TOKENS[2].cell.selectedOnCell).toBe(true);
    expect(THEME_TOKENS[2].cell.selected).toBe("bg-white/30 hover:bg-white/40");
    expect(THEME_TOKENS[2].dialog.bodyClass).toBeTruthy();
  });

  it("主题 5 的可选令牌与页面结构一致", () => {
    expect(THEME_TOKENS[5].sidebar).toBeDefined();
    expect(THEME_TOKENS[5].contentClass).toBe("lg:pl-16");
    expect(THEME_TOKENS[5].cellGridGap).toBe("");
    expect(THEME_TOKENS[5].dayListSpacing).toBe("mt-5 space-y-4");
    expect(THEME_TOKENS[5].dialog.bodyClass).toBeTruthy();
  });

  it("主题 6 的可选令牌与页面结构一致", () => {
    expect(THEME_TOKENS[6].itemDecor).toBeDefined();
    expect(THEME_TOKENS[6].dotColors).toHaveLength(3);
    expect(THEME_TOKENS[6].header.tagline).toBeDefined();
    expect(THEME_TOKENS[6].dialog.decor).toBeDefined();
    expect(THEME_TOKENS[6].card).toContain("rotate-[0.5deg]");
    expect(THEME_TOKENS[6].card).not.toContain("-rotate-[0.5deg]");
    expect(THEME_TOKENS[6].dayListSpacing).toBe("mt-5 space-y-4");
    expect(THEME_TOKENS[6].dialog.bodyClass).toBeTruthy();
  });

  it("主题 7 的可选令牌与页面结构一致", () => {
    expect(THEME_TOKENS[7].cell.todayWins).toBe(true);
    expect(THEME_TOKENS[7].dotColors).toHaveLength(5);
    expect(THEME_TOKENS[7].itemColors).toHaveLength(4);
    expect(THEME_TOKENS[7].dialog.decor).toBeDefined();
    expect(THEME_TOKENS[7].dialog.bodyClass).toBeTruthy();
  });

  it.each([1, 2, 5, 6, 7])("主题 %i 的弹窗 bodyClass 非空", (n) => {
    expect(THEME_TOKENS[n].dialog.bodyClass, `tokens[${n}].dialog.bodyClass`).toBeTruthy();
  });

  it("style-1 关键字符串精确匹配（防 typo/回归）", () => {
    expect(THEME_TOKENS[1].main).toBe("min-h-screen bg-[#fafafa]");
    expect(THEME_TOKENS[1].button.primary).toBe(
      "rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700",
    );
    expect(THEME_TOKENS[1].cell.today).toBe("border-2 border-blue-600 text-neutral-900");
    expect(THEME_TOKENS[1].cell.selected).toBe("bg-blue-600 text-white");
    expect(THEME_TOKENS[1].viewTab.active).toBe(
      "rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white",
    );
    expect(THEME_TOKENS[1].dialog.bodyClass).toBe("p-6");
    expect(THEME_TOKENS[1].dayList.title).toBe("truncate text-sm text-neutral-900");
  });
});
