import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import Home from "./page";

afterEach(() => cleanup());

describe("home page", () => {
  it("直接渲染极简主题日程应用", () => {
    render(<Home />);
    expect(screen.getByText("日程")).toBeInTheDocument();
  });
});
