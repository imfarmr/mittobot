import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
}

/** Fade-in wrapper with a subtle upward drift. Respects reduced motion. */
export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.35,
  y = 10,
}: FadeInProps) {
  const [mounted, setMounted] = useState(prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) return;
    // tiny frame delay so the browser actually renders the initial state
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const reduce = prefersReducedMotion();
  return (
    <div
      className={cn(className)}
      style={{
        opacity: 1,
        transform: reduce ? "translateY(0)" : mounted ? "translateY(0)" : `translateY(${y}px)`,
        transition: reduce
          ? "none"
          : `opacity ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

/** Container that fades in, then reveals children with staggered delays. */
export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.05,
}: StaggerContainerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={cn(className)}
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(8px)",
        transition: `opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)`,
      }}
    >
      {Array.isArray(children)
        ? children.map((child, i) => (
            <div
              key={i}
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(6px)",
                transition: `opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1) ${i * staggerDelay}s, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1) ${i * staggerDelay}s`,
              }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
}
