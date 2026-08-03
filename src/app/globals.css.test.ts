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
});
