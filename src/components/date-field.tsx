"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { id as localeId } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dateFromIso, isoFromDate, tanggalPanjang } from "@/lib/hr";
import { cn } from "@/lib/utils";

/**
 * Date picker that submits like `<input type="date">` did: the ISO value lives
 * in a hidden input under the same `name`, so nothing downstream changes.
 * Conversions go through isoFromDate/dateFromIso — `toISOString()` here would
 * hand back yesterday's date for anyone in WIB.
 */
export function DateField({
  name,
  defaultValue,
  id,
  min,
  max,
  className,
  autoSubmit,
}: {
  name: string;
  /** YYYY-MM-DD */
  defaultValue?: string;
  id?: string;
  min?: string;
  max?: string;
  className?: string;
  autoSubmit?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const hidden = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  // submit from an effect so the hidden input already carries the new value
  useEffect(() => {
    if (!submitting.current) return;
    submitting.current = false;
    hidden.current?.form?.requestSubmit();
  }, [value]);

  const bounds = [
    ...(min ? [{ before: dateFromIso(min) }] : []),
    ...(max ? [{ after: dateFromIso(max) }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input ref={hidden} type="hidden" name={name} value={value} readOnly />
      <PopoverTrigger
        id={id}
        className={cn(
          "bg-card border-border-strong hover:bg-accent tnum flex h-9 items-center gap-2 rounded-[9px] border px-2.5 text-[13px] transition-colors",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <CalendarDays
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />
        {value ? tanggalPanjang(value) : "Pilih tanggal"}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={localeId}
          defaultMonth={value ? dateFromIso(value) : undefined}
          selected={value ? dateFromIso(value) : undefined}
          startMonth={min ? dateFromIso(min) : undefined}
          endMonth={max ? dateFromIso(max) : undefined}
          disabled={bounds.length ? bounds : undefined}
          onSelect={(d) => {
            if (!d) return;
            submitting.current = Boolean(autoSubmit);
            setValue(isoFromDate(d));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
