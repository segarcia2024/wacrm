"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Lets the Inbox page tell the dashboard shell when a conversation
 * thread is open on mobile, so the shell can hide the app Header
 * (WhatsApp-style immersive chat). Desktop (lg+) ignores this flag
 * via CSS — the Header stays visible beside the three-pane layout.
 *
 * See docs/memory/INBOX-MOBILE-RESPONSIVE.md Fase 2.
 */
interface InboxChromeContextValue {
  /** True while Inbox has an active conversation (set by InboxPage). */
  mobileChatOpen: boolean;
  setMobileChatOpen: (open: boolean) => void;
}

const InboxChromeContext = createContext<InboxChromeContextValue | null>(null);

export function InboxChromeProvider({ children }: { children: ReactNode }) {
  const [mobileChatOpen, setMobileChatOpenState] = useState(false);
  const setMobileChatOpen = useCallback((open: boolean) => {
    setMobileChatOpenState(open);
  }, []);

  const value = useMemo(
    () => ({ mobileChatOpen, setMobileChatOpen }),
    [mobileChatOpen, setMobileChatOpen],
  );

  return (
    <InboxChromeContext.Provider value={value}>
      {children}
    </InboxChromeContext.Provider>
  );
}

export function useInboxChrome(): InboxChromeContextValue {
  const ctx = useContext(InboxChromeContext);
  if (!ctx) {
    // Safe no-op outside the dashboard shell (tests, story-like mounts).
    return {
      mobileChatOpen: false,
      setMobileChatOpen: () => {},
    };
  }
  return ctx;
}
