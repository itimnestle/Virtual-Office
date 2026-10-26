"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { Icon, type IconName } from "@/components/icon";

const icons: Record<string, IconName> = { dashboard: "grid", office: "office", tasks: "tasks", inbox: "inbox", meetings: "meeting", calendar: "calendar", notifications: "bell", settings: "settings", admin: "people" };

export function NavLinks({ items }: { items: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="app-nav">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "app-nav-link",
              active && "is-active",
            )}
          >
            <Icon name={icons[item.href.split("/")[1]] ?? "grid"} size={19} /><span>{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-white">{item.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
