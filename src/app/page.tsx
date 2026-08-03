"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSavedThemePath } from "@/lib/themes";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getSavedThemePath());
  }, [router]);

  return <main className="min-h-screen bg-neutral-50" />;
}
