"use client";

import { Button, Card } from "@/components/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const th = typeof document !== "undefined" && document.documentElement.lang === "th";
  return (
    <Card className="flex flex-col items-start gap-3">
      <h1 className="text-lg font-semibold">{th ? "เกิดข้อผิดพลาด" : "Something went wrong"}</h1>
      <p className="text-sm text-muted">
        {th ? "ไม่สามารถโหลดหน้านี้ได้ กรุณาลองใหม่" : "This page could not be loaded. Please try again."}
      </p>
      <Button onClick={reset}>{th ? "ลองใหม่" : "Try again"}</Button>
    </Card>
  );
}
