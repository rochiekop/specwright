import type { PlanStep } from "@/db/schema";
import { PLAN_STEPS } from "@/lib/plan-steps";

export function Stepper({ current }: { current: PlanStep }) {
  const at = PLAN_STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Plan progress">
      {PLAN_STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            aria-current={i === at ? "step" : undefined}
            className={
              i < at
                ? "flex items-center gap-1.5 text-accent"
                : i === at
                  ? "flex items-center gap-1.5 font-medium text-text"
                  : "flex items-center gap-1.5 text-muted"
            }
          >
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
                i < at ? "bg-accent text-accent-fg" : i === at ? "border-2 border-accent" : "border border-border"
              }`}
            >
              {i < at ? "✓" : i + 1}
            </span>
            {s.label}
          </span>
          {i < PLAN_STEPS.length - 1 && <span className="h-px w-6 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
