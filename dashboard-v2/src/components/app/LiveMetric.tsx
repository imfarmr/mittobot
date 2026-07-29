import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animations/AnimatedNumber";
import { usePrevious } from "@/hooks/usePrevious";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { LucideIcon } from "lucide-react";

export interface LiveMetricProps {
  label: string;
  value: number | null;
  unit?: string;
  sub?: string;
  icon: LucideIcon;
  accent?: "default" | "warning" | "success" | "info";
  formatter?: (n: number) => string;
  /** Polling interval used to throttle update flashes (ms). */
  flashCooldown?: number;
  /** Whether the numeric value should animate on change. */
  animated?: boolean;
  className?: string;
}

const ACCENT_CLASSES: Record<string, string> = {
  default: "text-foreground",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
};

/** A telemetry tile that smoothly animates number changes and flashes
 *  subtly when a new value arrives. Respects reduced motion. */
export function LiveMetric({
  label,
  value,
  unit = "",
  sub,
  icon: Icon,
  accent = "default",
  formatter,
  flashCooldown = 1000,
  animated = true,
  className,
}: LiveMetricProps) {
  const previous = usePrevious(value);
  const [flashing, setFlashing] = useState(false);
  const lastFlash = useRef<number>(0);

  useEffect(() => {
    if (value === previous) return;
    if (value == null || previous == null) return;
    const now = Date.now();
    if (now - lastFlash.current < flashCooldown) return;

    lastFlash.current = now;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 700);
    return () => clearTimeout(t);
  }, [value, previous, flashCooldown]);

  const reduce = useReducedMotion();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/30 bg-background-alt/30 p-3 transition-all",
        "hover:border-primary/20",
        flashing && !reduce && "live-metric-flash",
        className
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <Icon className="size-3.5" />
        <span className="flex-1">{label}</span>
        <span
          className={cn(
            "size-1.5 rounded-full bg-success",
            !reduce && "animate-pulse"
          )}
          aria-hidden="true"
        />
      </div>
      <div className={cn("text-lg font-bold font-mono mt-1", ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.default)}>
        {value != null ? (
          animated ? (
            <AnimatedNumber value={value} duration={700} formatter={formatter} />
          ) : (
            <span>{formatter?.(value) ?? value}</span>
          )
        ) : (
          <span>—</span>
        )}
        {unit}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}
