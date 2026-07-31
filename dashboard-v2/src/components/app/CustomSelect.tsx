import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface CustomSelectOption {
  value: string;
  label: string;
}

const NONE = "__none__";

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  allowNone = false,
  noneLabel = "None",
  className,
  triggerClassName,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
}) {
  const selectValue = value || (allowNone ? NONE : "");
  const selectOptions = useMemo(() => {
    if (!value || options.some((option) => option.value === value)) return options;
    // Preserve a saved/custom value even when the remote option list has not
    // loaded it yet (for example, a provider model entered manually).
    return [{ value, label: value }, ...options];
  }, [options, value]);

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => onChange(next === NONE ? "" : next)}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("w-full", triggerClassName)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={className}>
        {allowNone && (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">{noneLabel}</span>
          </SelectItem>
        )}
        {selectOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
