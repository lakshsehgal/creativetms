import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { PendingApproval } from "@/components/shell/pending-approval";
import { ConnectionStatus } from "@/components/shell/connection-status";
import { NotificationPopups } from "@/components/shell/notification-popups";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  // Signed in, but nobody has let them in yet.
  if (!profile.is_active) return <PendingApproval email={profile.email} />;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar profile={profile} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Both are shrink-0 strips above the page, so they push content down
            rather than covering it — an alert that hides the thing it's about
            is worse than no alert. */}
        <ConnectionStatus />
        <NotificationPopups profile={profile} />
        {children}
      </main>
    </div>
  );
}
