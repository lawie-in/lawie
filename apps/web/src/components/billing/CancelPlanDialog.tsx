'use client';

import { PLAN_COPY } from '@/components/billing/planCopy';
import { Dialog } from '@/components/ui';

/**
 * T-509 — the cancel confirm (copy §4.4). Destructive "Cancel plan", ghost "Keep my plan". The
 * cancel takes effect at the end of the cycle (T-508). On an error the line shows in the dialog
 * and the confirm button becomes "Retry". A bottom sheet at <= 640px (the Dialog does that).
 */
export interface CancelPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Formatted end of the paid period. */
  date: string;
  onConfirm: () => void;
  loading: boolean;
  failed: boolean;
}

export function CancelPlanDialog({
  open,
  onOpenChange,
  date,
  onConfirm,
  loading,
  failed,
}: CancelPlanDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="destructive"
      title={PLAN_COPY.cancelTitle}
      description={PLAN_COPY.cancelBody(date)}
      confirmLabel={failed ? PLAN_COPY.retry : PLAN_COPY.cancelConfirm}
      cancelLabel={PLAN_COPY.cancelKeep}
      onConfirm={onConfirm}
      confirmLoading={loading}
      error={failed ? PLAN_COPY.cancelError : undefined}
    />
  );
}

export default CancelPlanDialog;
