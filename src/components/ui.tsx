import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "bg-surface-2 text-text border border-border hover:bg-border/60",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "ui-btn inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        `ui-btn--${variant}`,
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

const fieldBase =
  "ui-field w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-[var(--ring)]";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "min-h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "min-h-10", className)} {...props} />;
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="ui-field-group flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="ui-label text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("ui-card rounded-2xl border border-border bg-surface p-5 shadow-sm", className)}>{children}</section>;
}

type BadgeTone = "neutral" | "primary" | "accent" | "danger" | "warning" | "ok";
const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary/15 text-primary",
  accent: "bg-accent/20 text-accent",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  ok: "bg-ok/15 text-ok",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cn("ui-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", `ui-badge--${tone}`, badgeTones[tone])}>
      {children}
    </span>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "ok" | "warning"; children: ReactNode }) {
  const tones = {
    danger: "border-danger/40 bg-danger/10 text-danger",
    ok: "border-ok/40 bg-ok/10 text-ok",
    warning: "border-warning/40 bg-warning/10 text-warning",
  };
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={cn("ui-alert rounded-xl border px-3 py-2 text-sm", `ui-alert--${tone}`, tones[tone])}>
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="ui-empty rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{children}</p>;
}
