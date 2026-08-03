import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import Home from "./page";
import { THEME_STORAGE_KEY, DEFAULT_THEME_PATH } from "@/lib/themes";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  replaceMock.mockClear();
});

describe("home page", () => {
  it("未保存时重定向默认主题", async () => {
    render(<Home />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(DEFAULT_THEME_PATH));
  });

  it("保存过时重定向到保存的主题", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "/style-7");
    render(<Home />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/style-7"));
  });

  it("已删除主题回退默认", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "/style-3");
    render(<Home />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(DEFAULT_THEME_PATH));
  });
});
