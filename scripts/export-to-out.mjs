// scripts/export-to-out.mjs
// 将 next build 的静态导出（.next-export）整理成干净的 out/，供 Tauri 打包。
// 排除构建产物 cache/server/types，避免安装包体积膨胀。
import { cpSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const src = ".next-export";
const dest = "out";
const exclude = new Set(["cache", "server", "types"]);

if (!existsSync(src)) {
  console.error(`[export-to-out] 找不到 ${src}，请先运行 next build`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const entry of readdirSync(src)) {
  if (exclude.has(entry)) continue;
  cpSync(join(src, entry), join(dest, entry), { recursive: true, force: true });
}
console.log(`[export-to-out] 静态导出已拷贝到 ${dest}/`);
