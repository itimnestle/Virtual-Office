import { getRequestDictionary, getRequestLocale } from "@/lib/auth/session";
import { setLocaleCookie } from "./actions";
import { Icon } from "@/components/icon";
import { WorkspaceIllustration } from "@/components/office/workspace-illustration";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [t, locale] = await Promise.all([getRequestDictionary(), getRequestLocale()]);
  return (
    <main className="auth-shell">
      <section className="auth-story" aria-label={t.appName}>
        <div className="auth-story-brand"><span><Icon name="office" size={26} /></span>{t.appName}</div>
        <div className="auth-story-body"><p className="office-eyebrow"><span />WORK BETTER, TOGETHER</p><h2>{locale === "th" ? <>ออฟฟิศที่ดี<br />เริ่มต้นจากทีมที่ใกล้กัน</> : <>Good work starts<br />with a closer team.</>}</h2><p>{locale === "th" ? "พื้นที่สำหรับทุกคน ทุกไอเดีย และทุกวันทำงานของเรา" : "A space for your people, your ideas, and your everyday."}</p><WorkspaceIllustration /><div className="auth-story-tags"><span><Icon name="people" size={14} />{locale === "th" ? "เห็นภาพรวมทีม" : "Know your team"}</span><span><Icon name="tasks" size={14} />{locale === "th" ? "ติดตามงานได้ง่าย" : "Find your flow"}</span><span><Icon name="office" size={14} />{locale === "th" ? "เชื่อมต่อในพื้นที่เดียว" : "Feel connected"}</span></div></div>
        <p className="auth-story-footer">A LITTLE SPACE FOR BIG IDEAS.</p>
      </section>
      <section className="auth-form-side">
      <header className="auth-form-header">
        <div className="auth-mobile-brand"><Icon name="office" size={22} /><span>{t.appName}</span></div>
        <form action={setLocaleCookie}>
          <input type="hidden" name="locale" value={locale === "th" ? "en" : "th"} />
          <button type="submit" className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-text">
            {locale === "th" ? "EN" : "ไทย"}
          </button>
        </form>
      </header>
      <div className="auth-form-content"><p className="auth-welcome">{locale === "th" ? "ยินดีต้อนรับสู่พื้นที่ของเรา" : "MAKE YOURSELF AT HOME"}</p>{children}</div>
      <footer className="auth-form-footer"><span /><p>{t.tagline}</p></footer>
      </section>
    </main>
  );
}
