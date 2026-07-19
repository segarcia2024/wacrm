"use client";

import { useEffect, useState } from "react";

/**
 * False on the server and on the client's first render; true after mount.
 * Use to defer UI that depends on localStorage / DOM attrs until after
 * hydration so server HTML always matches the initial client pass.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}
