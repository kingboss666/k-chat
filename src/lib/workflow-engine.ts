export interface WorkflowStep<TContext> {
  name: string
  run: (context: TContext) => Promise<TContext>
}

export interface WorkflowRunHooks<TContext> {
  onStepStart?: (step: WorkflowStep<TContext>, context: TContext) => Promise<void> | void
  onStepComplete?: (step: WorkflowStep<TContext>, context: TContext) => Promise<void> | void
}

export async function runWorkflow<TContext>(
  workflow: WorkflowStep<TContext>[],
  initialContext: TContext,
  hooks?: WorkflowRunHooks<TContext>,
) {
  let context = initialContext

  for (const step of workflow) {
    await hooks?.onStepStart?.(step, context)
    context = await step.run(context)
    await hooks?.onStepComplete?.(step, context)
  }

  return context
}
