import Link from "next/link";

const STYLES = [
  { n: 1, name: "极简留白", desc: "大量留白 · 细线 · 克制的黑白灰", colors: ["#171717", "#525252", "#d4d4d4", "#2563eb", "#f5f5f5"] },
  { n: 2, name: "玻璃拟态", desc: "渐变背景 · 磨砂玻璃卡片 · 柔和光晕", colors: ["#7c3aed", "#db2777", "#f59e0b", "#ffffff", "#94a3b8"] },
  { n: 3, name: "深色霓虹", desc: "黑底 · 霓虹发光 · 赛博朋克", colors: ["#0a0a12", "#00f0ff", "#ff2eff", "#39ff14", "#8b5cf6"] },
  { n: 4, name: "马卡龙清新", desc: "粉彩糖果色 · 大圆角 · 轻松俏皮", colors: ["#ffb6c8", "#a8e6cf", "#ffe08a", "#c3b1e1", "#a0d8f1"] },
  { n: 5, name: "商务专业", desc: "深蓝 · 白 · 金 · 庄重办公风", colors: ["#1e3a5f", "#ffffff", "#c9a961", "#f5f7fa", "#94a3b8"] },
  { n: 6, name: "手账笔记本", desc: "横线纸 · 手写体 · 贴纸胶带", colors: ["#fbf6e9", "#4a3f35", "#e05a5a", "#4a7bb5", "#c9a961"] },
  { n: 7, name: "现代渐变", desc: "鲜艳渐变 · 大号排版 · 杂志感", colors: ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9"] },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <header className="mx-auto mb-10 max-w-5xl">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">日程系统 · 风格 Demo</h1>
        <p className="mt-2 text-neutral-500">浏览 7 种视觉风格，选择你最喜欢的一个。</p>
      </header>
      <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {STYLES.map((s) => (
          <Link
            key={s.n}
            href={`/style-${s.n}`}
            className="group rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-400">style-{s.n}</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-neutral-900">{s.name}</h2>
            <p className="mt-1 text-sm text-neutral-500">{s.desc}</p>
            <div className="mt-4 flex gap-1.5">
              {s.colors.map((c) => (
                <span key={c} className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span className="mt-4 inline-block text-sm font-medium text-neutral-400 transition group-hover:text-neutral-900">
              查看 →
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
