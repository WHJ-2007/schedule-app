# 日程系统

本地优先的日程管理应用，支持周 / 月 / 年三种视图，重复日程、拖拽调整、完成标记、开始/结束提醒、版本历史撤销与日程图片分享。

## 功能

- **三种视图**：周视图时间轴（可缩放、凌晨折叠）、月视图日历 + 当日看板、年视图总览
- **重复日程**：每天 / 每 N 天 / 每周 / 每月 / 工作日 / 周末，可设截止日期，实例级完成标记
- **拖拽交互**：时间块拖拽改期、全天事件横向跨天拉伸、边界拖拽改重复范围
- **完成追踪**：单次与重复日程实例级完成标记，过期未完成自动变暗红
- **日程提醒**：有时间的日程在开始与结束时发送系统通知，未授权时保留应用内提醒
- **撤销历史**：操作可撤销 / 重做；桌面端持久化到应用数据目录，浏览器开发模式回退到本地存储
- **图片分享**：当前视图可导出为排版后的 PNG，也可直接复制图片到剪贴板

## 快速开始（开发模式）

```bash
npm install
npm run dev   # http://localhost:4321
```

Windows 下可直接双击 `启动器.bat`，使用图形化启动器管理服务的启停与日志（需要本机安装 Node.js）。

## 桌面客户端（Windows）

项目已封装为 Tauri 桌面客户端，可生成一键安装程序，直接安装到没有 Node.js 开发环境的电脑。

正式安装包可从 [GitHub Releases](https://github.com/WHJ-2007/schedule-app/releases/latest) 下载。

**构建安装包**（需要本机有 Node.js + Rust + MSVC 工具链）：

```bash
npm install
npm run desktop:build  # 静态导出、编译 Rust 并打包 NSIS 安装程序
```

安装包输出在 `src-tauri/target/release/bundle/nsis/日程系统_1.1.0_x64-setup.exe`，拷到目标电脑双击即可安装。

- **安装位置**：Program Files（安装时需管理员权限）
- **日程数据**：`%APPDATA%\com.scheduleapp.desktop\versions.json`（撤销历史等数据存在用户目录，卸载应用后仍保留）
- **卸载**：通过 Windows「设置 → 应用 → 日程系统」卸载
- **签名说明**：当前安装包未使用商业代码签名证书，Windows SmartScreen 可能要求选择「更多信息 → 仍要运行」

> `启动器.bat` / `tools/launcher` 是开发模式的本地服务启动器；桌面客户端是独立窗口应用，两者数据存储位置不同。

## 测试

```bash
npm test
```

## 技术栈

Next.js 15 · React 19 · Tailwind CSS 4 · TypeScript · Vitest
