import { useState } from "react";
import { Palette, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccentColor } from "@/hooks/useAccentColor";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { color, setColor, presets } = useAccentColor();
  const [custom, setCustom] = useState(color.replace("#", "").toUpperCase());
  const [open, setOpen] = useState(false);

  const handleCustom = (value: string) => {
    setCustom(value.toUpperCase());
    const hex = value.startsWith("#") ? value : `#${value}`;
    if (/^#([A-Fa-f0-9]{6})$/.test(hex)) {
      setColor(hex);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          title="Accent color"
        >
          <Palette className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 space-y-4" align="end">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">Accent Color</h4>
          <p className="text-xs text-muted-foreground">Pick a brand color for the dashboard.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                setColor(preset.value);
                setCustom(preset.value.replace("#", "").toUpperCase());
              }}
              className={cn(
                "flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all",
                color === preset.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/30 bg-background-alt/20 hover:border-border/50 text-foreground"
              )}
            >
              <span
                className="size-6 rounded-full border border-border/40 shadow-sm"
                style={{ backgroundColor: preset.value }}
              />
              <span className="text-[10px] font-medium">{preset.label}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Custom</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                setCustom(e.target.value.replace("#", "").toUpperCase());
              }}
              className="size-8 rounded cursor-pointer border border-border/40 bg-transparent"
              aria-label="Pick custom accent color"
            />
            <Input
              value={custom}
              onChange={(e) => handleCustom(e.target.value)}
              className="flex-1 text-xs font-mono h-8"
              placeholder="RRGGBB"
              maxLength={7}
            />
          </div>
          {custom && !/^#?([A-Fa-f0-9]{6})$/.test(custom) && (
            <p className="text-[10px] text-destructive">Enter a valid hex color.</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/20">
          <Check className="size-3.5" />
          <span>Preview updates instantly</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
