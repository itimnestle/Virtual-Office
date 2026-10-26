import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";

export default async function Home() {
  redirect((await getViewer()) ? "/office" : "/login");
}
