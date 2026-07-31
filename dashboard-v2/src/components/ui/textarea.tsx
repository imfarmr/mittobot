import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[88px] w-full rounded-lg border border-white/[0.12] bg-white/[0.055] px-3.5 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground/55 hover:border-white/[0.18] hover:bg-white/[0.07] focus-visible:border-primary/70 focus-visible:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
