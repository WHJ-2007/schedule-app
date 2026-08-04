import { describe, it, expect } from "vitest";
import { THEME_TOKENS } from "./theme-tokens";

const REQUIRED_TOP = ["main", "header", "sectionTitle", "weekdayHeader", "navButton", "card", "button", "cell", "dot", "dotMore", "todayMark", "dayList", "dialog", "viewTab", "weekView", "yearView"] as const;

describe("theme tokens", () => {
  it("极简主题为单一令牌对象，关键令牌齐全", () => {
    expect(THEME_TOKENS).toBeTypeOf("object");
    for (const key of REQUIRED_TOP) expect(THEME_TOKENS[key]).toBeDefined();
    expect(THEME_TOKENS.main).toBe("min-h-screen bg-[#fafafa]");
  });

  it("头部标题为极简日程", () => {
    expect(String(THEME_TOKENS.header.title)).toContain("极简");
  });

  it("不使用可选面板令牌（手账已删除）", () => {
    expect(THEME_TOKENS.viewPanel).toBeUndefined();
    expect(THEME_TOKENS.dotColors).toBeUndefined();
    expect(THEME_TOKENS.itemColors).toBeUndefined();
  });

  it("所有按钮令牌带 transition", () => {
    expect(THEME_TOKENS.navButton).toContain("transition");
    expect(THEME_TOKENS.button.primary).toContain("transition");
    expect(THEME_TOKENS.viewTab.active).toContain("transition");
    expect(THEME_TOKENS.viewTab.inactive).toContain("transition");
    expect(THEME_TOKENS.dayList.editButton).toContain("transition");
    expect(THEME_TOKENS.dayList.delete).toContain("transition");
    expect(THEME_TOKENS.dialog.cancel).toContain("transition");
    expect(THEME_TOKENS.dialog.save).toContain("transition");
  });

  it("弹窗 bodyClass 非空", () => {
    expect(THEME_TOKENS.dialog.bodyClass).toBeTruthy();
  });

  it("style-1 关键字符串精确匹配（防 typo/回归）", () => {
    expect(THEME_TOKENS.main).toBe("min-h-screen bg-[#fafafa]");
    expect(THEME_TOKENS.button.primary).toBe(
      "rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700",
    );
    expect(THEME_TOKENS.cell.today).toBe("border-2 border-blue-600 text-neutral-900");
    expect(THEME_TOKENS.cell.selected).toBe("bg-blue-600 text-white");
    expect(THEME_TOKENS.viewTab.active).toBe(
      "rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white transition",
    );
    expect(THEME_TOKENS.dialog.bodyClass).toBe("p-6");
    expect(THEME_TOKENS.dayList.title).toBe("truncate text-sm text-neutral-900");
  });

  it("编辑按钮为深色工具风格", () => {
    expect(THEME_TOKENS.weekView.eventEdit).toContain("bg-neutral-900");
    expect(THEME_TOKENS.weekView.eventEdit).toContain("text-white");
  });

  it("极简主题拖拽气泡白底黑字", () => {
    const tip = THEME_TOKENS.weekView.dragTip;
    expect(tip).toContain("bg-white");
    expect(tip).toContain("text-neutral-900");
  });

  it("光标横线与标签令牌非空", () => {
    const w = THEME_TOKENS.weekView;
    expect(w.cursorLine.length).toBeGreaterThan(0);
    expect(w.cursorLabel.length).toBeGreaterThan(0);
  });
});
