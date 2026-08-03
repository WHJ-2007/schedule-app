import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("globals.css", () => {
  it("定义了动画 keyframes 与减弱动态降级", () => {
    const css = readFileSync("src/app/globals.css", "utf-8");
    expect(css).toContain("@keyframes fade-in");
    expect(css).toContain("@keyframes scale-in");
    expect(css).toContain("@keyframes slide-up");
    expect(css).toContain(".anim-fade-in");
    expect(css).toContain(".anim-scale-in");
    expect(css).toContain(".anim-slide-up");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("全局按钮反馈动画存在且排除禁用态", () => {
    const css = readFileSync("src/app/globals.css", "utf-8");
    expect(css).toContain("button:hover:not(:disabled) { transform: scale(1.02); }");
    expect(css).toContain("button:active:not(:disabled) { transform: scale(0.96); }");
    expect(css).toContain("button {");
    expect(css).toContain("transition-duration: 150ms");
    expect(css).toContain("@media (hover: hover)");
  });

  it("已删除主题的动画规则不再存在", () => {
    const css = readFileSync("src/app/globals.css", "utf-8");
    expect(css).not.toContain("gradient-move");
    expect(css).not.toContain("float-slow");
    expect(css).not.toContain("animate-gradient-move");
    expect(css).not.toContain("animate-float-slow");
  });
});
