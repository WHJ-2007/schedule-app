import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "日程系统 · 主题 Demo",
  description: "5 种主题的日程系统演示",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
