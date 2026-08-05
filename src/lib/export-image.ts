import { toBlob } from "html-to-image";

export type ExportResult = "copied" | "downloaded";

// 把节点渲染成 JPG 写入剪贴板；浏览器不支持剪贴板图片时回退为下载
export async function copyViewAsJpeg(node: HTMLElement): Promise<ExportResult> {
  const blob = await toBlob(node, {
    quality: 0.95,
    pixelRatio: 3,
    backgroundColor: "#fafafa",
    // 截图时排除瞬态交互元素：光标线/光标标签/拖选高亮/编辑手柄
    filter: (n) =>
      !(
        n instanceof Element &&
        n.matches(
          '[data-testid="cursor-line"], [data-testid="cursor-label"], [data-testid="drag-select"], [data-testid="resize-handle-start"], [data-testid="resize-handle-end"]'
        )
      ),
  });
  if (!blob) throw new Error("render failed");
  const w = navigator as Navigator & {
    clipboard?: Clipboard & { write?: (items: ClipboardItems) => Promise<void> };
  };
  if (w.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await w.clipboard.write([new ClipboardItem({ "image/jpeg": blob })]);
      return "copied";
    } catch {
      // 剪贴板写入被拒绝（权限/用户激活过期）→ 回退为下载文件
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "日程.jpg";
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
