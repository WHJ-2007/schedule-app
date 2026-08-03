import { describe, it, expect } from "vitest";
import { THEME_TOKENS } from "./theme-tokens";

const REQUIRED_TOP = ["main", "header", "sectionTitle", "weekdayHeader", "navButton", "card", "button", "cell", "dot", "dotMore", "todayMark", "dayList", "dialog", "viewTab", "weekView", "yearView"] as const;

describe("theme tokens", () => {
  it("恰好覆盖 2 个保留主题", () => {
    expect(Object.keys(THEME_TOKENS).map(Number).sort()).toEqual([1, 6]);
  });

  it.each([1, 6])("主题 %i 的关键令牌非空", (n) => {
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
    expect(String(THEME_TOKENS[6].header.title)).toContain("手账");
  });

  it("主题 1 不使用可选面板令牌", () => {
    expect(THEME_TOKENS[1].viewPanel).toBeUndefined();
    expect(THEME_TOKENS[1].dotColors).toBeUndefined();
    expect(THEME_TOKENS[1].itemColors).toBeUndefined();
  });

  it("主题 6 的可选令牌与页面结构一致", () => {
    expect(THEME_TOKENS[6].viewPanel).toBeDefined();
    expect(THEME_TOKENS[6].itemDecor).toBeDefined();
    expect(THEME_TOKENS[6].dotColors).toHaveLength(3);
    expect(THEME_TOKENS[6].itemColors).toHaveLength(3);
    expect(THEME_TOKENS[6].header.tagline).toBeDefined();
    expect(THEME_TOKENS[6].dialog.decor).toBeDefined();
    expect(THEME_TOKENS[6].card).toContain("rotate-[0.5deg]");
    expect(THEME_TOKENS[6].card).not.toContain("-rotate-[0.5deg]");
    expect(THEME_TOKENS[6].dayListSpacing).toBe("mt-5 space-y-4");
    expect(THEME_TOKENS[6].dialog.bodyClass).toBeTruthy();
  });

  it.each([1, 6])("主题 %i 的所有按钮令牌带 transition", (n) => {
    const t = THEME_TOKENS[n];
    expect(t.navButton).toContain("transition");
    expect(t.button.primary).toContain("transition");
    expect(t.viewTab.active).toContain("transition");
    expect(t.viewTab.inactive).toContain("transition");
    expect(t.dayList.editButton).toContain("transition");
    expect(t.dayList.delete).toContain("transition");
    expect(t.dialog.cancel).toContain("transition");
    expect(t.dialog.save).toContain("transition");
  });

  it.each([1, 6])("主题 %i 的弹窗 bodyClass 非空", (n) => {
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
      "rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white transition",
    );
    expect(THEME_TOKENS[1].dialog.bodyClass).toBe("p-6");
    expect(THEME_TOKENS[1].dayList.title).toBe("truncate text-sm text-neutral-900");
  });

  it("style-6 关键字符串精确匹配（防 typo/回归）", () => {
    expect(THEME_TOKENS[6].main).toContain("paper-lines");
    expect(THEME_TOKENS[6].viewTab.active).toBe(
      "rounded-full bg-[#4a3f35] px-4 py-1.5 font-kai text-sm text-white transition",
    );
    expect(THEME_TOKENS[6].dialog.save).toBe(
      "font-hand rounded-lg bg-[#4a7bb5] px-4 py-2 text-white transition",
    );
  });
});
