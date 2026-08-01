"use client";

import { useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

/**
 * shadcn Select that still behaves like a form field: Radix renders a hidden
 * native select for `name`, so the existing GET filter forms and the
 * `new FormData(form)` handlers keep reading it without any change.
 */
export function SelectField({
  name,
  defaultValue,
  options,
  placeholder,
  ariaLabel,
  id,
  className,
  autoSubmit,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  options: Option[];
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  className?: string;
  /** submit the surrounding form as soon as a value is picked (filters) */
  autoSubmit?: boolean;
  /** for selects that drive something other than a form submit */
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const trigger = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);

  // submit from an effect, not from onValueChange: by then Radix has written
  // the new value into its hidden native select
  useEffect(() => {
    if (!submitting.current) return;
    submitting.current = false;
    trigger.current?.form?.requestSubmit();
  }, [value]);

  return (
    <Select
      name={name}
      value={value}
      onValueChange={(v) => {
        submitting.current = Boolean(autoSubmit);
        setValue(v);
        onChange?.(v);
      }}
    >
      <SelectTrigger
        ref={trigger}
        id={id}
        aria-label={ariaLabel}
        // the size variant sets h-8 through a data-attribute, which outranks a
        // plain h-9 — override it on the same variant to match the text inputs
        className={cn(
          "bg-card border-border-strong data-[size=default]:h-9 rounded-[9px] px-2.5 text-[13px]",
          className,
        )}
      >
        {/* render the label ourselves: Radix's own value text is portalled from
            the item list, which only exists after hydration */}
        <SelectValue placeholder={placeholder}>
          {options.find((o) => o.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      {/* popper + trigger width: drops below the field instead of covering it */}
      <SelectContent
        position="popper"
        align="start"
        className="min-w-(--radix-select-trigger-width) p-1"
      >
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="h-8 text-[13px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
