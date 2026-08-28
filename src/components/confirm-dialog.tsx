"use client";

import { TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * Replaces window.confirm (Design System §dialogs). Two looks: neutral for
 * consequential-but-safe actions, `destructive` for anything that removes
 * something — warning tile plus a solid danger button, per the mockup.
 *
 * Deliberately uncontrolled: Radix closes on Cancel and on Action, and the
 * result of the mutation is already reported by a toast, so there is no pending
 * state to thread through. The trigger the caller passes keeps its own
 * `disabled={m.isPending}`.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  destructive,
  icon: Icon = TriangleAlert,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Ikon tile; default segitiga peringatan, `null` untuk tanpa tile. */
  icon?: React.ElementType | null;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          {destructive && Icon && (
            <AlertDialogMedia className="bg-danger-subtle text-danger ring-1 ring-danger/20">
              <Icon aria-hidden />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            // the button's own `destructive` variant is tinted; the mockup asks
            // for solid danger on the confirming action
            className={cn(
              destructive &&
                "bg-danger text-white shadow-sm hover:bg-danger/90 focus-visible:border-danger/40 focus-visible:ring-danger/30",
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
