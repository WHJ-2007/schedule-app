import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toBlob } from "html-to-image";
import { copyViewToClipboard, downloadViewAsPng } from "./export-image";

vi.mock("html-to-image", () => ({ toBlob: vi.fn() }));

const mockedToBlob = vi.mocked(toBlob);
const options = {
  title: "2026年8月",
  view: "month" as const,
  viewLabel: "月视图",
};

describe("export-image", () => {
  beforeEach(() => {
    mockedToBlob.mockReset();
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:fake"),
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll("[data-export-canvas]").forEach((el) => el.remove());
  });

  it("导出 PNG：使用独立分享卡画布、清晰标题与下载文件名", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    mockedToBlob.mockResolvedValue(blob);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const source = document.createElement("div");
    source.innerHTML = '<div data-date="2026-08-28">28</div>';

    await downloadViewAsPng(source, options);

    const canvas = mockedToBlob.mock.calls[0][0] as HTMLElement;
    expect(canvas.dataset.exportCanvas).toBe("");
    // 被截图节点自身不能带离屏位移；html-to-image 会复制它的 computed style，
    // 否则正文会被整体绘制到画布之外，只剩 backgroundColor。
    expect(canvas.style.position).toBe("relative");
    expect(canvas.style.left).toBe("0px");
    expect((canvas.parentElement as HTMLElement).style.left).toBe("-100000px");
    expect(canvas.textContent).toContain("2026年8月");
    expect(canvas.textContent).toContain("月视图");
    expect(canvas.textContent).toContain("日程");
    expect(mockedToBlob).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({
        pixelRatio: 2,
        backgroundColor: "#eef3f8",
        type: "image/png",
      })
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(document.querySelector("[data-export-canvas]")).toBeNull();
  });

  it("复制图片：以 image/png 写入剪贴板，不触发下载", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    mockedToBlob.mockResolvedValue(blob);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
    (globalThis as Record<string, unknown>).ClipboardItem = class {
      constructor(public items: Record<string, Blob>) {}
      get types() {
        return Object.keys(this.items);
      }
    };

    await copyViewToClipboard(document.createElement("div"), options);

    const items = write.mock.calls[0][0] as ClipboardItems;
    expect(items[0].types).toContain("image/png");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("剪贴板图片能力不可用时给出可执行的恢复提示", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    (globalThis as Record<string, unknown>).ClipboardItem = undefined;
    await expect(copyViewToClipboard(document.createElement("div"), options)).rejects.toThrow(
      "请使用导出按钮下载"
    );
    expect(mockedToBlob).not.toHaveBeenCalled();
  });

  it("渲染失败时移除临时画布", async () => {
    mockedToBlob.mockResolvedValue(null);
    await expect(downloadViewAsPng(document.createElement("div"), options)).rejects.toThrow(
      "图片渲染失败"
    );
    expect(document.querySelector("[data-export-canvas]")).toBeNull();
  });

  it("截图 filter 排除瞬态交互元素，保留日程内容", async () => {
    mockedToBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await downloadViewAsPng(document.createElement("div"), options);
    const exportOptions = mockedToBlob.mock.calls[0][1] as {
      filter?: (n: HTMLElement) => boolean;
    };
    const selection = document.createElement("div");
    selection.dataset.testid = "selection-bubble";
    expect(exportOptions.filter?.(selection)).toBe(false);
    const ignored = document.createElement("button");
    ignored.dataset.exportIgnore = "";
    expect(exportOptions.filter?.(ignored)).toBe(false);
    expect(exportOptions.filter?.(document.createElement("div"))).toBe(true);
  });

  it("周视图导出会展开时间轴滚动区域", async () => {
    mockedToBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const source = document.createElement("div");
    const scroll = document.createElement("div");
    scroll.dataset.testid = "timeline-scroll";
    Object.defineProperty(scroll, "scrollHeight", { value: 1440 });
    source.append(scroll);

    await downloadViewAsPng(source, {
      title: "8月24日–8月30日",
      view: "week",
      viewLabel: "周视图",
    });

    const canvas = mockedToBlob.mock.calls[0][0] as HTMLElement;
    const clonedScroll = canvas.querySelector<HTMLElement>('[data-testid="timeline-scroll"]');
    expect(clonedScroll?.style.height).toBe("1440px");
    expect(clonedScroll?.style.overflow).toBe("visible");
  });
});
