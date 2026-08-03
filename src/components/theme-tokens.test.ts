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
});
