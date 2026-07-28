import { redirect } from "next/navigation";

/** Public landing disabled for MVP — CRM entry is /login. */
export default function HomePage() {
  redirect("/login");
}
