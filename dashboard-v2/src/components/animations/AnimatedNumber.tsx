import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface AnimatedNumberProps {
  value: number | string;
  className?: string;
  duration?: number;
  formatter?: (n: number) => string;
}

function parseValue(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Renders a number that counts up/down from 0 to the target value. Respects reduced motion. */
export function AnimatedNumber({
  value,
  className,
  duration = 800,
  formatter,
}: AnimatedNumberProps) {
  const target = parseValue(value);
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    fromRef.current = displayRef.current;
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = fromRef.current + (target - fromRef.current) * eased;
      displayRef.current = current;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  const formatted =
    formatter?.(display) ??
    (Number.isInteger(target) ? Math.round(display).toLocaleString() : display.toFixed(2));

  return <span className={cn("tabular-nums", className)}>{formatted}</span>;
}
