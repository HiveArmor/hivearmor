"use client";

// Scheduling functionality lives in /reports — redirect there.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReportSchedulesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/reports");
  }, [router]);
  return null;
}
