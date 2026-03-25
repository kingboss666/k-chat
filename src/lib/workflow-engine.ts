export interface WorkflowStep<TContext> {
  name: string
  run: (context: TContext) => Promise<TContext>
}

export interface WorkflowRunHooks<TContext> {
  onStepStart?: (step: WorkflowStep<TContext>, context: TContext) => Promise<void> | void
  onStepComplete?: (step: WorkflowStep<TContext>, context: TContext) => Promise<void> | void
}

export interface PlannedWorkflowState<TContext, TResult> {
  context: TContext
  results: Record<string, TResult>
}

export interface PlannedWorkflowOutcome<TContext, TResult> {
  context?: TContext
  result: TResult
}

export interface PlannedWorkflowRunHooks<TTask, TContext, TResult> {
  onTaskStart?: (task: TTask, state: PlannedWorkflowState<TContext, TResult>) => Promise<void> | void
  onTaskComplete?: (task: TTask, state: PlannedWorkflowState<TContext, TResult>) => Promise<void> | void
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

export async function* runPlannedWorkflow<TTask extends { id: string }, TContext, TResult, TEvent = never>(
  tasks: TTask[],
  initialState: PlannedWorkflowState<TContext, TResult>,
  executeTask: (
    task: TTask,
    state: PlannedWorkflowState<TContext, TResult>,
  ) => AsyncGenerator<TEvent, PlannedWorkflowOutcome<TContext, TResult>, void>,
  hooks?: PlannedWorkflowRunHooks<TTask, TContext, TResult>,
): AsyncGenerator<TEvent, PlannedWorkflowState<TContext, TResult>> {
  let state = initialState

  for (const task of tasks) {
    await hooks?.onTaskStart?.(task, state)

    const iterator = executeTask(task, state)[Symbol.asyncIterator]()
    let taskOutcome: PlannedWorkflowOutcome<TContext, TResult> | undefined

    while (true) {
      const iteration = await iterator.next()

      if (iteration.done) {
        taskOutcome = iteration.value
        break
      }

      yield iteration.value
    }

    if (!taskOutcome) {
      throw new Error(`任务 ${task.id} 没有返回执行结果。`)
    }

    state = {
      context: taskOutcome.context ?? state.context,
      results: {
        ...state.results,
        [task.id]: taskOutcome.result,
      },
    }

    await hooks?.onTaskComplete?.(task, state)
  }

  return state
}
