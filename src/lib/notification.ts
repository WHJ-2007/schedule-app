import type { ScheduleReminder } from "./reminders";

export type ReminderPermission = "granted" | "denied" | "unsupported";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function ensureReminderPermission(): Promise<ReminderPermission> {
  if (typeof window === "undefined") return "unsupported";
  if (isTauriRuntime()) {
    try {
      const notification = await import("@tauri-apps/plugin-notification");
      if (await notification.isPermissionGranted()) return "granted";
      return (await notification.requestPermission()) === "granted" ? "granted" : "denied";
    } catch {
      return "unsupported";
    }
  }
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return (await Notification.requestPermission()) === "granted" ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

async function hasReminderPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isTauriRuntime()) {
    try {
      const notification = await import("@tauri-apps/plugin-notification");
      return await notification.isPermissionGranted();
    } catch {
      return false;
    }
  }
  return "Notification" in window && Notification.permission === "granted";
}

export async function showScheduleReminder(reminder: ScheduleReminder): Promise<boolean> {
  const title = reminder.moment === "start" ? `${reminder.title} 开始了` : `${reminder.title} 已结束`;
  const body = `${reminder.instanceDate} ${reminder.time} · ${reminder.moment === "start" ? "开始提醒" : "结束提醒"}`;
  let delivered = false;

  if (await hasReminderPermission()) {
    if (isTauriRuntime()) {
      try {
        const notification = await import("@tauri-apps/plugin-notification");
        notification.sendNotification({ title, body, silent: true });
        delivered = true;
      } catch {
        delivered = false;
      }
    } else {
      try {
        new Notification(title, { body, tag: reminder.key, silent: true });
        delivered = true;
      } catch {
        delivered = false;
      }
    }
  }

  return delivered;
}
