import { useEffect, useState } from "react";

/** Tracks the user's reduced-motion preference and updates live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", listener);
    } else {
      // Safari < 14 fallback
      mql.addListener(listener);
    }
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", listener);
      } else {
        mql.removeListener(listener);
      }
    };
  }, []);

  return reduced;
}
