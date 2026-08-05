import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyViewAsJpeg } from "./export-image";
import { toBlob } from "html-to-image";

vi.mock("html-to-image", () => ({ toBlob: vi.fn() }));

const mockedToBlob = vi.mocked(toBlob);

describe("copyViewAsJpeg", () => {
  beforeEach(() => {
    mockedToBlob.mockReset();
    // jsdom 的 URL 没有 createObjectURL：直接注入（下载回退路径需要）
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:fake"), configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("支持剪贴板图片：JPG blob 写入 clipboard，返回 copied", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    mockedToBlob.mockResolvedValue(blob);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
    (globalThis as Record<string, unknown>).ClipboardItem = class {
      constructor(public items: Record<string, Blob>) {}
      get types() {
        return Object.keys(this.items);
      }
    };
    const el = document.createElement("div");
    const result = await copyViewAsJpeg(el);
    expect(result).toBe("copied");
    expect(mockedToBlob).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ quality: 0.95, pixelRatio: 3, backgroundColor: "#fafafa" })
    );
    const items = write.mock.calls[0][0] as ClipboardItems;
    expect(items[0].types).toContain("image/jpeg");
  });

  it("剪贴板写入被拒绝：回退下载 JPG 文件，返回 downloaded", async () => {
    mockedToBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    const write = vi.fn().mockRejectedValue(new DOMException("Write permission denied", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
    (globalThis as Record<string, unknown>).ClipboardItem = class {
      constructor(public items: Record<string, Blob>) {}
      get types() {
        return Object.keys(this.items);
      }
    };
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const result = await copyViewAsJpeg(document.createElement("div"));
    expect(result).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("无剪贴板图片支持：回退下载 JPG 文件，返回 downloaded", async () => {
    mockedToBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const result = await copyViewAsJpeg(document.createElement("div"));
    expect(result).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("渲染失败（toBlob 返回 null）时抛错", async () => {
    mockedToBlob.mockResolvedValue(null);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await expect(copyViewAsJpeg(document.createElement("div"))).rejects.toThrow();
  });

  it("截图 filter 排除瞬态交互元素（光标线/拖选/手柄），保留常规元素", async () => {
    mockedToBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    const el = document.createElement("div");
    await copyViewAsJpeg(el);
    const opts = mockedToBlob.mock.calls[0][1] as { filter?: (n: Node) => boolean };
    const line = document.createElement("div");
    line.setAttribute("data-testid", "cursor-line");
    expect(opts.filter?.(line)).toBe(false);
    const handle = document.createElement("div");
    handle.setAttribute("data-testid", "resize-handle-end");
    expect(opts.filter?.(handle)).toBe(false);
    const plain = document.createElement("div");
    expect(opts.filter?.(plain)).toBe(true);
  });
});
