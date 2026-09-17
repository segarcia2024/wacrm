"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import {
  InboxChromeProvider,
  useInboxChrome,
} from "@/hooks/use-inbox-chrome";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { cn } from "@/lib/utils";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { mobileChatOpen } = useInboxChrome();
  // Inbox owns its own scroll panes (list + thread). Using the shell's
  // overflow-y-auto here nests scroll with h-[100vh]-style calcs and
  // clips the composer on mobile browsers — see INBOX-MOBILE-RESPONSIVE.
  const isInbox = pathname === "/inbox";

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Immersive mobile chat: close the drawer if it was open when the
  // agent opens a thread (Header/hamburger is hidden in that mode).
  useEffect(() => {
    if (mobileChatOpen) closeSidebar();
  }, [mobileChatOpen, closeSidebar]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Fase 2: hide the app Header under lg while a chat thread is
            open — the thread header (back + name) is the only chrome.
            lg+ always keeps the Header (three-pane desktop layout). */}
        <div className={cn(mobileChatOpen && "hidden lg:block")}>
          <Header onOpenSidebar={() => setSidebarOpen(true)} />
        </div>
        {/* Inbox: fill remaining height, no outer scroll, no padding
            (list/thread go edge-to-edge under the app header).
            Other routes: keep the previous padded scrolling main. */}
        <main
          className={cn(
            "min-h-0 flex-1",
            isInbox
              ? "flex flex-col overflow-hidden p-0"
              : "overflow-y-auto p-4 sm:p-6",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser: User;
}) {
  return (
    <AuthProvider initialUser={initialUser}>
      <InboxChromeProvider>
        <DashboardShellInner>{children}</DashboardShellInner>
      </InboxChromeProvider>
    </AuthProvider>
  );
}
