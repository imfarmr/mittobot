import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mitto_performance_mode";
const EVENT_NAME = "mitto:performance-mode";

function readStoredValue() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

/** Keeps expensive glass/motion effects optional and synchronized app-wide. */
export function usePerformanceMode() {
  const [enabled, setEnabled] = useState(readStoredValue);

  useEffect(() => {
    const apply = (next: boolean) => {
      document.documentElement.classList.toggle("performance-mode", next);
      document.body.classList.toggle("performance-mode", next);
    };

    apply(enabled);
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") {
        setEnabled(next);
        apply(next);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const next = event.newValue === "true";
        setEnabled(next);
        apply(next);
      }
    };

    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled]);

  const setPerformanceMode = useCallback((next: boolean) => {
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }, []);

  return { performanceMode: enabled, setPerformanceMode };
}
