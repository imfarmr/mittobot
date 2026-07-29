import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer relative overflow-hidden active:scale-[0.96] active:duration-75",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary/90 to-primary text-primary-foreground shadow-[0_0_0_0_rgba(99,102,241,0)] hover:shadow-[0_0_20px_-4px_var(--primary)] hover:brightness-110 hover:-translate-y-0.5 before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/10 before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 hover:shadow-[0_0_18px_-4px_var(--destructive)] hover:-translate-y-0.5",
        outline:
          "border border-border bg-transparent hover:bg-accent/60 hover:text-accent-foreground hover:border-primary/30 hover:shadow-[0_0_15px_-4px_var(--primary)/20] hover:-translate-y-0.5",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent hover:shadow-sm hover:-translate-y-0.5",
        success:
          "bg-success/15 text-success border border-success/30 hover:bg-success/25 hover:shadow-[0_0_18px_-4px_var(--success)] hover:-translate-y-0.5",
        ghost: "hover:bg-accent/70 hover:text-accent-foreground hover:-translate-y-0.5",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function spinnerClass(size?: string) {
  const base = "inline-block animate-spin rounded-full border-2 border-current border-t-transparent";
  if (size === "sm") return `${base} size-3.5`;
  if (size === "lg") return `${base} size-5`;
  return `${base} size-4`;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className={cn("absolute inset-0 flex items-center justify-center", spinnerClass(size || "default"))} aria-hidden="true" />
      )}
      <span className={cn(loading && "opacity-0", "relative flex items-center justify-center gap-2")}>{children}</span>
    </Comp>
  );
}

export { Button, buttonVariants };
