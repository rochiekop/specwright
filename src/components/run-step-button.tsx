"use client";

import { useState, useTransition } from "react";
import type { StepResult } from "@/app/plan-actions";

/** Runs a slow AI step with a clear pending state and inline error. */
export function RunStepButton({
  run,
  label,
  pendingLabel,
  confirmMessage,
  className = "btn btn-primary",
}: {
  run: () => Promise<StepResult>;
  label: string;
  pendingLabel: string;
  confirmMessage?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirmMessage && !confirm(confirmMessage)) return;
          setError(undefined);
          start(async () => {
            const res = await run();
            if (res.error) setError(res.error);
          });
        }}
      >
        {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        {pending ? pendingLabel : label}
      </button>
      {error && <p className="max-w-md text-right text-sm text-danger">{error}</p>}
    </div>
  );
}
