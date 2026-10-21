import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getPrdVersions } from "@/lib/documents";
import type { Answers, Question } from "@/db/schema";
import { ConfirmButton } from "@/components/confirm-button";
import { PlanForm } from "@/components/plan-form";
import { QuestionsForm } from "@/components/questions-form";
import { RunStepButton } from "@/components/run-step-button";
import { Stepper } from "@/components/stepper";
import { deletePlan, updatePlanIdea } from "../../actions";
import { generateQuestions, reopenQuestions } from "../../plan-actions";

export default async function PlanPage(props: PageProps<"/plans/[id]">) {
  const { id } = await props.params;
  const db = await getDb();
  const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, id) });
  if (!plan) notFound();
  const project = await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.id, plan.projectId) });
  const presets = await db.query.stackPresets.findMany();
  const hasQuestions = plan.questions.length > 0;
  const prdCount = (await getPrdVersions(plan.id)).length;
  const taskRows = await db.query.tasks.findMany({ where: (t, { eq }) => eq(t.planId, plan.id), columns: { status: true } });
  const taskCount = taskRows.length;
  const taskDone = taskRows.filter((t) => t.status === "done").length;
  const featureCount = (
    await db.query.features.findMany({ where: (f, { and, eq, isNull }) => and(eq(f.planId, plan.id), isNull(f.parentId)), columns: { id: true } })
  ).length;

  const ideaForm = (
    <PlanForm action={updatePlanIdea} presets={presets} hidden={{ id: plan.id }} initial={plan} submitLabel="Save idea" />
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/projects/${plan.projectId}`} className="text-sm text-muted hover:text-text">← {project?.name}</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.title}</h1>
        </div>
        <form action={deletePlan}>
          <input type="hidden" name="id" value={plan.id} />
          <ConfirmButton message={`Delete the plan "${plan.title}"?`} className="btn btn-ghost text-danger">
            Delete plan
          </ConfirmButton>
        </form>
      </div>

      <Stepper current={plan.currentStep} />

      {plan.currentStep === "idea" ? (
        <>
          {ideaForm}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm">
              <div className="font-medium">Next: clarifying questions</div>
              <div className="text-muted">3–6 questions that decide what the PRD says. Takes about 20–40 seconds.</div>
            </div>
            <RunStepButton
              run={generateQuestions.bind(null, plan.id)}
              label="Generate questions"
              pendingLabel="Writing questions…"
            />
          </div>
        </>
      ) : (
        <details className="card group p-4">
          <summary className="cursor-pointer list-none text-sm">
            <span className="font-medium">Idea &amp; stack</span>
            <span className="ml-2 text-muted group-open:hidden">· {plan.idea.slice(0, 90)}{plan.idea.length > 90 ? "…" : ""}</span>
          </summary>
          <div className="mt-4">{ideaForm}</div>
        </details>
      )}

      {plan.currentStep === "questions" && hasQuestions && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">A few questions</h2>
              <p className="text-sm text-muted">
                Skip anything you don&apos;t know yet; the PRD will record it as an open assumption instead of guessing.
              </p>
            </div>
            <RunStepButton
              run={generateQuestions.bind(null, plan.id)}
              label="Regenerate"
              pendingLabel="Writing questions…"
              confirmMessage="Replace all questions? Your current answers will be cleared."
              className="btn btn-ghost"
            />
          </div>
          {/* Remount only when the first-round set is replaced (Regenerate), so stale drafts are dropped;
              appending follow-ups keeps the form, and with it the result banner. */}
          <QuestionsForm
            key={plan.questions
              .filter((q) => (q.round ?? 1) === 1)
              .map((q) => `${q.id}:${q.question}`)
              .join("|")}
            planId={plan.id}
            questions={plan.questions}
            answers={plan.answers}
          />
        </section>
      )}

      {plan.currentStep !== "idea" && plan.currentStep !== "questions" && (
        <>
          <AnswersSummary questions={plan.questions} answers={plan.answers} planId={plan.id} />
          <div className="card divide-y divide-border">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm">
                <div className="font-medium">{featureCount ? "Feature map" : "Next: feature map"}</div>
                <div className="text-muted">
                  {featureCount
                    ? `${featureCount} features. Shape the menus and modules here before writing the PRD.`
                    : "Turns your idea and answers into features and sub-features you can edit."}
                </div>
              </div>
              <Link href={`/plans/${plan.id}/features`} className={featureCount && prdCount ? "btn btn-ghost" : "btn btn-primary"}>
                {featureCount ? "Open feature map" : "Build feature map"}
              </Link>
            </div>
            {featureCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm">
                  <div className="font-medium">{prdCount ? "PRD" : "Next: write the PRD"}</div>
                  <div className="text-muted">
                    {prdCount
                      ? `${prdCount} version${prdCount === 1 ? "" : "s"}. Changed the map? Rewrite it from the PRD page.`
                      : "Written around your feature map, so it stays focused."}
                  </div>
                </div>
                <Link href={`/plans/${plan.id}/prd`} className={prdCount && taskCount ? "btn btn-ghost" : "btn btn-primary"}>
                  {prdCount ? "Open PRD" : "Write PRD"}
                </Link>
              </div>
            )}
            {prdCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm">
                  <div className="font-medium">{taskCount ? "Tasks" : "Next: tasks"}</div>
                  <div className="text-muted">
                    {taskCount
                      ? `${taskDone}/${taskCount} done.`
                      : "Focused tasks per feature for a coding agent, with dependencies and a board."}
                  </div>
                </div>
                <Link href={`/plans/${plan.id}/tasks`} className="btn btn-primary">{taskCount ? "Open tasks" : "Generate tasks"}</Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AnswersSummary({ questions, answers, planId }: { questions: Question[]; answers: Answers; planId: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Your answers</h2>
        <RunStepButton run={reopenQuestions.bind(null, planId)} label="Edit answers" pendingLabel="Opening…" className="btn btn-ghost" />
      </div>
      <dl className="card divide-y divide-border">
        {questions.map((q) => {
          const a = answers[q.id];
          return (
            <div key={q.id} className="px-4 py-3 text-sm">
              <dt className="text-muted">{q.question}</dt>
              <dd className="mt-1">
                {a == null ? (
                  <span className="italic text-warn">Skipped: will be listed as an assumption</span>
                ) : Array.isArray(a) ? (
                  a.join(" · ")
                ) : (
                  a
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
