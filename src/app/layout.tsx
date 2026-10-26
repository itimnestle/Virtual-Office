import type { Metadata, Viewport } from "next";
import { getRequestLocale, getViewer } from "@/lib/auth/session";
import "./globals.css";
import "./office.css";

export const metadata: Metadata = {
  title: { default: "3D Virtual Office", template: "%s · 3D Virtual Office" },
  description: "Work assignment and tracking for real teams, shown as a 3D office.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [viewer, locale] = await Promise.all([getViewer(), getRequestLocale()]);
  const theme = viewer?.theme ?? "system";
  return (
    <html
      lang={locale}
      data-theme={theme === "system" ? undefined : theme}
      data-reduce-motion={viewer?.reduceMotion ? "true" : undefined}
    >
      {/* Browser extensions (e.g. Demoway) add attributes to <body> before React hydrates;
          this only ignores <body>'s own attributes, not its children. */}
      <body className="min-h-dvh" suppressHydrationWarning>{children}</body>
    </html>
  );
}
