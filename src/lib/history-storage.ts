import { invoke } from "@tauri-apps/api/core";

export type HistoryFile = { entries: unknown[]; index: number };

// 桌面端（Tauri）无 localStorage 之外的文件能力，历史栈持久化改走 Rust 命令：
// load_history / save_history 读写 AppData 下的 versions.json（见 src-tauri/src/lib.rs）。
// 浏览器 / 测试环境没有 Tauri 运行时，invoke 会抛错 → 回退 localStorage，避免竞态。
const FALLBACK_KEY = "schedule-history-file";

// 浏览器/测试环境的同步回退：无 Tauri 运行时（invoke 不可用）时直接读 localStorage，
// 避免 mount 恢复变成异步造成测试竞态
export function loadHistoryFileSync(): HistoryFile | null {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as HistoryFile) : null;
  } catch {
    return null;
  }
}

export async function loadHistoryFile(): Promise<HistoryFile | null> {
  try {
    const data = await invoke<HistoryFile>("load_history");
    if (data && Array.isArray(data.entries)) return data;
  } catch {
    // 无 Tauri 运行时 → 走 localStorage 回退
  }
  return loadHistoryFileSync();
}

export async function saveHistoryFile(entries: unknown[], index: number): Promise<void> {
  try {
    await invoke("save_history", { entries, index });
    return;
  } catch {
    // 无 Tauri 运行时 → 写 localStorage 回退
  }
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify({ entries, index }));
  } catch {
    // 写入失败降级：不阻塞主流程
  }
}
