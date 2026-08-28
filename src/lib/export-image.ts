import { toBlob } from "html-to-image";

export type ExportView = "month" | "week" | "year";

export type ExportImageOptions = {
  title: string;
  view: ExportView;
  viewLabel: string;
  fileName?: string;
};

const EXPORT_BG = "#eef3f8";
const EXPORT_WIDTH: Record<ExportView, number> = {
  month: 900,
  week: 1080,
  year: 1040,
};

const TRANSIENT_SELECTOR = [
  "[data-export-ignore]",
  '[data-testid="selection-bubble"]',
  '[data-testid="cursor-line"]',
  '[data-testid="cursor-label"]',
  '[data-testid="drag-select"]',
  '[data-testid="resize-handle-start"]',
  '[data-testid="resize-handle-end"]',
].join(",");

function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles: Partial<CSSStyleDeclaration>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el.style, styles);
  return el;
}

function formatGeneratedAt(now: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

function createExportCanvas(node: HTMLElement, options: ExportImageOptions): HTMLElement {
  const contentWidth = Math.max(EXPORT_WIDTH[options.view], node.scrollWidth);
  const canvas = makeElement("section", {
    position: "relative",
    left: "0px",
    top: "0",
    width: `${contentWidth + 112}px`,
    boxSizing: "border-box",
    padding: "48px 56px 38px",
    background: EXPORT_BG,
    color: "#172033",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  });
  canvas.dataset.exportCanvas = "";

  const header = makeElement("header", {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    marginBottom: "28px",
  });
  const title = makeElement("h1", {
    margin: "0",
    color: "#111827",
    fontSize: "34px",
    fontWeight: "650",
    letterSpacing: "-0.02em",
    lineHeight: "1.18",
  });
  title.textContent = options.title;
  const badge = makeElement("span", {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "32px",
    boxSizing: "border-box",
    padding: "6px 13px",
    borderRadius: "999px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: "13px",
    fontWeight: "650",
    whiteSpace: "nowrap",
  });
  badge.textContent = options.viewLabel;
  header.append(title, badge);

  const content = makeElement("div", {
    width: `${contentWidth}px`,
    boxSizing: "border-box",
    padding: options.view === "week" ? "28px 24px 24px" : "30px",
    borderRadius: "16px",
    background: "#ffffff",
    boxShadow: "0 18px 48px rgba(44, 62, 92, 0.14)",
    overflow: "hidden",
  });
  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.width = "100%";
  clone.style.maxWidth = "none";
  clone.style.margin = "0";
  clone.style.animation = "none";
  clone.style.transition = "none";
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.style.animation = "none";
    el.style.transition = "none";
  });

  if (options.view === "year") {
    clone.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
  }

  const sourceScroll = node.querySelector<HTMLElement>('[data-testid="timeline-scroll"]');
  const clonedScroll = clone.querySelector<HTMLElement>('[data-testid="timeline-scroll"]');
  if (sourceScroll && clonedScroll) {
    clonedScroll.style.height = `${sourceScroll.scrollHeight}px`;
    clonedScroll.style.maxHeight = "none";
    clonedScroll.style.overflow = "visible";
  }
  content.append(clone);

  const footer = makeElement("footer", {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    marginTop: "26px",
    color: "#536278",
    fontSize: "12px",
    lineHeight: "1.5",
  });
  const brand = document.createElement("span");
  brand.textContent = "日程";
  brand.style.fontWeight = "650";
  brand.style.color = "#315a9b";
  const generatedAt = document.createElement("span");
  generatedAt.textContent = `生成于 ${formatGeneratedAt(new Date())}`;
  footer.append(brand, generatedAt);

  canvas.append(header, content, footer);
  return canvas;
}

async function renderViewAsPng(
  node: HTMLElement,
  options: ExportImageOptions
): Promise<Blob> {
  const canvas = createExportCanvas(node, options);
  // 只让宿主负责离屏放置；被 html-to-image 截取的 canvas 必须留在自身坐标原点。
  // 若 canvas 自己带 -100000px 位移，该位移会进入克隆样式，正文就会被画到图片之外。
  const host = makeElement("div", {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: canvas.style.width,
  });
  host.dataset.exportHost = "";
  host.append(canvas);
  document.body.append(host);
  try {
    await document.fonts?.ready;
    const blob = await toBlob(canvas, {
      pixelRatio: 2,
      backgroundColor: EXPORT_BG,
      type: "image/png",
      cacheBust: true,
      filter: (n) => !(n instanceof Element && n.matches(TRANSIENT_SELECTOR)),
    });
    if (!blob) throw new Error("图片渲染失败");
    return blob;
  } finally {
    host.remove();
  }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

export async function downloadViewAsPng(
  node: HTMLElement,
  options: ExportImageOptions
): Promise<void> {
  const blob = await renderViewAsPng(node, options);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(options.fileName ?? options.title + "日程")}.png`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function copyViewToClipboard(
  node: HTMLElement,
  options: ExportImageOptions
): Promise<void> {
  const clipboard = navigator.clipboard as
    | (Clipboard & { write?: (items: ClipboardItems) => Promise<void> })
    | undefined;
  if (!clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("当前环境不支持复制图片，请使用导出按钮下载");
  }
  const blob = await renderViewAsPng(node, options);
  await clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
