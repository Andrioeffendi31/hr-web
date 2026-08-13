"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Option } from "@/components/select-field";
import { cn } from "@/lib/utils";

/**
 * Searchable picker for lists that grow (employees, divisions). Same form
 * contract as SelectField — the value rides along in a hidden input.
 *
 * `allowCreate` keeps what the old `<datalist>` on Divisi could do: type a
 * value that doesn't exist yet and use it as-is.
 */
export function ComboboxField({
  name,
  defaultValue,
  options,
  placeholder = "Pilih…",
  searchPlaceholder = "Cari…",
  emptyText = "Tidak ditemukan.",
  clearLabel,
  allowCreate,
  id,
  className,
}: {
  name: string;
  defaultValue?: string;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** renders a "none" entry with this label; the submitted value is "" */
  clearLabel?: string;
  allowCreate?: boolean;
  id?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // a created value has no option row, so fall back to the raw value
  const label = options.find((o) => o.value === value)?.label ?? value;
  const canCreate =
    allowCreate &&
    query.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  const pick = (v: string) => {
    setValue(v);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={value} readOnly />
      <PopoverTrigger
        id={id}
        role="combobox"
        aria-expanded={open}
        className={cn(
          "bg-card border-border-strong hover:bg-accent flex h-9 w-full items-center justify-between gap-2 rounded-[9px] border px-2.5 text-left text-[13px] transition-colors",
          !label && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{label || placeholder}</span>
        <ChevronsUpDown
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem value="__clear__" onSelect={() => pick("")}>
                  <span className="text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => pick(o.value)}
                >
                  <Check
                    className={cn(
                      "size-3.5",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  {o.label}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={() => pick(query.trim())}
                >
                  Pakai &quot;{query.trim()}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
