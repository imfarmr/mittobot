import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LoadingFallbackProps {
  text?: string;
  variant?: "full" | "inline";
}

/** Shimmer skeleton bar that sweeps a subtle highlight across the surface. */
function ShimmerBar({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer-sweep bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="border-border/40 bg-card/40">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <ShimmerBar className="h-3 w-16 bg-muted" />
        <ShimmerBar className="size-4 bg-muted" />
      </CardHeader>
      <CardContent>
        <ShimmerBar className="h-7 w-20 bg-muted" />
        <ShimmerBar className="h-2.5 w-28 mt-2 bg-muted" />
      </CardContent>
    </Card>
  );
}

export function LoadingFallback({ text, variant = "full" }: LoadingFallbackProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // tiny delay to prevent jarring flash on fast connections
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const inline = variant === "inline";

  return (
    <div
      className={`opacity-0 animate-in fade-in duration-300 ${inline ? "py-8" : "min-h-[60vh] p-4 md:p-6"}`}
      style={{ opacity: mounted ? 1 : 0 }}
    >
      {inline ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ShimmerBar className="size-5 bg-muted" />
            <div className="space-y-1.5">
              <ShimmerBar className="h-4 w-32 bg-muted" />
              <ShimmerBar className="h-3 w-48 bg-muted" />
            </div>
          </div>
          <div className="space-y-2">
            <ShimmerBar className="h-8 w-full bg-muted" />
            <ShimmerBar className="h-8 w-full bg-muted" />
            <ShimmerBar className="h-8 w-3/4 bg-muted" />
          </div>
          {text && (
            <p className="text-center text-xs text-muted-foreground font-mono animate-pulse pt-2">
              {text}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header skeleton */}
          <div className="flex items-center gap-3">
            <ShimmerBar className="size-5 bg-muted" />
            <div className="space-y-1.5">
              <ShimmerBar className="h-5 w-40 bg-muted" />
              <ShimmerBar className="h-3 w-56 bg-muted" />
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>

          {/* Main card skeleton */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader>
              <ShimmerBar className="h-4 w-32 bg-muted" />
              <ShimmerBar className="h-3 w-48 mt-1.5 bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <ShimmerBar key={i} className="h-8 w-full bg-muted" />
              ))}
            </CardContent>
          </Card>

          {text && (
            <p className="text-center text-xs text-muted-foreground font-mono animate-pulse">
              {text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
