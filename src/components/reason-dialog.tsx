"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Replaces window.prompt where the action needs a free-text reason. The
 * "wajib diisi" rule is the textarea's own `required` — the browser blocks the
 * submit, so there is no validation branch to get wrong.
 */
export function ReasonDialog({
  trigger,
  title,
  description,
  label,
  placeholder,
  required,
  confirmLabel,
  onSubmit,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  label: string;
  placeholder?: string;
  required?: boolean;
  confirmLabel: string;
  onSubmit: (note: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") ?? "").trim();
            setOpen(false);
            onSubmit(note);
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-[15px]">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-[12.5px]">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>

          <label className="mt-4 mb-4 block text-[12px] font-medium">
            {label}
            {!required && (
              <span className="text-subtle font-normal"> (opsional)</span>
            )}
            <Textarea
              name="note"
              required={required}
              autoFocus
              maxLength={500}
              rows={4}
              placeholder={placeholder}
              className="mt-1 text-[13px]"
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit">{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
