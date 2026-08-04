import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// 撤销历史持久化到项目文件 历史版本/versions.json（而非浏览器缓存）：
// 刷新/换设备后撤销栈仍在。最多保留 300 条版本。
const HISTORY_FILE = path.join(process.cwd(), "历史版本", "versions.json");
const MAX_ENTRIES = 300;

export async function GET() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    // 兼容旧裸数组格式
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : [];
    const index = typeof parsed?.index === "number" ? parsed.index : entries.length - 1;
    return NextResponse.json({ entries, index });
  } catch {
    return NextResponse.json({ entries: [], index: 0 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { entries?: unknown[]; index?: number };
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const index = typeof body.index === "number" ? body.index : entries.length - 1;
    await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
    await fs.writeFile(
      HISTORY_FILE,
      JSON.stringify({ entries: entries.slice(-MAX_ENTRIES), index: Math.min(index, entries.length - 1) }),
      "utf8"
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
