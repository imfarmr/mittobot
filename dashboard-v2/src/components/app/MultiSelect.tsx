import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  name: string;
}

/**
 * Searchable multi-select (channels, roles). Replaces v1's DropdownSelect.
 * `prefix` renders "#" for channels / "@" for roles in chips and rows.
 */
export function MultiSelect({
  items,
  selected,
  onChange,
  prefix = "",
  placeholder = "Select…",
  emptyText = "Nothing found.",
  searchPlaceholder = "Search…",
  clearLabel = "Clear selection",
  "aria-label": ariaLabel,
}: {
  items: Item[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  prefix?: string;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  clearLabel?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.id)),
    [items, selected]
  );

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal border-white/[0.14] bg-white/[0.055] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.12)] transition-[background-color,border-color,box-shadow,transform] hover:bg-white/[0.08] hover:border-white/[0.2] active:scale-[0.995]",
              selected.size === 0 && "text-muted-foreground"
            )}
          >
            <span className="truncate">
              {selected.size > 0 ? `${selected.size} selected` : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 overflow-hidden border-white/[0.14] bg-[#1c1c1e]/90 p-0 shadow-[0_18px_55px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl [-webkit-backdrop-filter:blur(24px)] supports-[backdrop-filter:blur(12px)]:bg-[#1c1c1e]/55" align="start">
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {selected.size ? `${selected.size} selected` : "Choose items"}
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                className="text-[10px] font-medium text-primary transition-colors hover:text-primary/70"
                onClick={() => onChange(new Set())}
              >
                {clearLabel}
              </button>
            )}
          </div>
          <Command className="rounded-none bg-transparent backdrop-blur-none">
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.name}
                    aria-label={`${item.name}${selected.has(item.id) ? ", selected" : ""}`}
                    onSelect={() => toggle(item.id)}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        selected.has(item.id) ? "opacity-100 text-primary" : "opacity-0"
                      )}
                    />
                    {prefix}
                    {item.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge key={item.id} variant="secondary" className="gap-1 border-white/[0.1] bg-white/[0.08] pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              {prefix}
              {item.name}
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive cursor-pointer"
                aria-label={`Remove ${item.name}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
