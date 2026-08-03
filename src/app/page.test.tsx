import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("home page", () => {
  it("links to all 7 style pages", () => {
    render(<Home />);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(screen.getByRole("link", { name: new RegExp(`style-${n}`) })).toHaveAttribute(
        "href",
        `/style-${n}`
      );
    }
  });
});
