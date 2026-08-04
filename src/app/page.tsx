"use client";

import ScheduleApp from "@/components/schedule-app";
import { THEME_TOKENS } from "@/components/theme-tokens";

export default function Home() {
  return <ScheduleApp tokens={THEME_TOKENS} />;
}
