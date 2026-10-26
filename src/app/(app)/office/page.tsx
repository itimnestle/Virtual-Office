import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const metadata = { title: "3D Office" };

/** The office itself is the app shell (see the (app) layout); this page only names it. */
export default async function OfficePage() {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  return <h1>{t.nav.office}</h1>;
}
