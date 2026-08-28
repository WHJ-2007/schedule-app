"use client";

import { useEffect, useRef } from "react";
import type { ScheduleEvent } from "./events";
import { showScheduleReminder } from "./notification";
import { getDueReminders, type ScheduleReminder } from "./reminders";

const POLL_INTERVAL_MS = 5_000;
const MAX_LATE_MS = 2 * 60_000;
const SENT_RETENTION_MS = 24 * 60 * 60_000;

export function useScheduleReminders(
  events: ScheduleEvent[],
  onReminder: (reminder: ScheduleReminder) => void
): void {
  const eventsRef = useRef(events);
  const onReminderRef = useRef(onReminder);
  eventsRef.current = events;
  onReminderRef.current = onReminder;

  useEffect(() => {
    let lastChecked = Date.now();
    const sent = new Map<string, number>();
    const check = () => {
      const now = Date.now();
      const from = Math.max(lastChecked, now - MAX_LATE_MS);
      lastChecked = now;
      for (const [key, at] of sent) {
        if (at < now - SENT_RETENTION_MS) sent.delete(key);
      }
      for (const reminder of getDueReminders(eventsRef.current, from, now)) {
        if (sent.has(reminder.key)) continue;
        sent.set(reminder.key, reminder.at);
        onReminderRef.current(reminder);
        void showScheduleReminder(reminder);
      }
    };
    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
}
