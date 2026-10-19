import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        userName={user.name ?? user.steamId}
        avatarUrl={user.avatarUrl}
        teamName={user.team?.name ?? null}
        role={user.role}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
