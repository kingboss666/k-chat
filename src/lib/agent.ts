export interface AgentPlanResult<TState, TTask, TUsage = unknown> {
  state?: TState
  tasks: TTask[]
  usage?: TUsage
}

export interface AgentExecutionResult<TState, TResult, TUsage = unknown> {
  state?: TState
  results: Record<string, TResult>
  usage?: TUsage
}

export interface AgentEvaluationResult<TEvaluation, TUsage = unknown> {
  evaluation: TEvaluation
  usage?: TUsage
}

export interface AgentIterationMetrics<TUsage = unknown> {
  planningMs: number
  executionMs: number
  evaluationMs: number
  totalMs: number
  planningUsage?: TUsage
  executionUsage?: TUsage
  evaluationUsage?: TUsage
}

export type AgentHookOutput<TEvent>
  = | void
    | TEvent
    | TEvent[]
    | AsyncIterable<TEvent>

type MaybePromise<T> = T | Promise<T>

export interface AgentLoopDecision<TState> {
  type: 'finish' | 'retry'
  state?: TState
}

export interface AgentPlanner<TState, TTask, TUsage = unknown> {
  plan: (state: TState) => Promise<AgentPlanResult<TState, TTask, TUsage>>
}

export interface AgentExecutor<TState, TResult, TEvent = never, TUsage = unknown> {
  execute: (state: TState) => AsyncGenerator<TEvent, AgentExecutionResult<TState, TResult, TUsage>, void>
}

export interface AgentEvaluator<TState, TEvaluation, TUsage = unknown> {
  evaluate: (state: TState) => Promise<AgentEvaluationResult<TEvaluation, TUsage>>
}

export interface AgentMemory<TInput, TState> {
  initialize: (input: TInput) => Promise<TState>
  finalize?: (params: { input: TInput, state: TState }) => Promise<void> | void
}

export interface AgentLifecycle<TState, TTask, TResult, TEvaluation, TUsage = unknown> {
  startIteration: (state: TState) => TState
  applyPlan: (state: TState, plan: AgentPlanResult<TState, TTask, TUsage>) => TState
  applyExecution: (state: TState, execution: AgentExecutionResult<TState, TResult, TUsage>) => TState
  applyEvaluation: (state: TState, evaluation: AgentEvaluationResult<TEvaluation, TUsage>) => TState
  decideNext: (state: TState, evaluation: TEvaluation) => AgentLoopDecision<TState>
}

export interface AgentIterationCompleteParams<TInput, TState, TTask, TResult, TEvaluation, TUsage = unknown> {
  input: TInput
  state: TState
  plan: AgentPlanResult<TState, TTask, TUsage>
  execution: AgentExecutionResult<TState, TResult, TUsage>
  evaluation: AgentEvaluationResult<TEvaluation, TUsage>
  metrics: AgentIterationMetrics<TUsage>
}

export interface AgentHookContext<TInput, TState> {
  input: TInput
  state: TState
}

export interface AgentPlanningHookContext<TInput, TState, TTask, TUsage = unknown> extends AgentHookContext<TInput, TState> {
  plan: AgentPlanResult<TState, TTask, TUsage>
}

export interface AgentExecutionHookContext<TInput, TState, TResult, TUsage = unknown> extends AgentHookContext<TInput, TState> {
  execution: AgentExecutionResult<TState, TResult, TUsage>
}

export interface AgentEvaluationHookContext<TInput, TState, TEvaluation, TUsage = unknown> extends AgentHookContext<TInput, TState> {
  evaluation: AgentEvaluationResult<TEvaluation, TUsage>
}

export interface AgentDecisionHookContext<TInput, TState, TEvaluation> extends AgentHookContext<TInput, TState> {
  evaluation: TEvaluation
}

export interface AgentRunHooks<TInput, TState, TTask, TResult, TEvaluation, TEvent = never, TUsage = unknown> {
  onRunStart?: (input: TInput) => MaybePromise<AgentHookOutput<TEvent>>
  onIterationStart?: (state: TState) => MaybePromise<AgentHookOutput<TEvent>>
  onPlanningStart?: (state: TState) => MaybePromise<AgentHookOutput<TEvent>>
  onPlanningComplete?: (context: AgentPlanningHookContext<TInput, TState, TTask, TUsage>) => MaybePromise<AgentHookOutput<TEvent>>
  onExecutionComplete?: (context: AgentExecutionHookContext<TInput, TState, TResult, TUsage>) => MaybePromise<AgentHookOutput<TEvent>>
  onEvaluationStart?: (state: TState) => MaybePromise<AgentHookOutput<TEvent>>
  onEvaluationComplete?: (context: AgentEvaluationHookContext<TInput, TState, TEvaluation, TUsage>) => MaybePromise<AgentHookOutput<TEvent>>
  onRetry?: (context: AgentDecisionHookContext<TInput, TState, TEvaluation>) => MaybePromise<AgentHookOutput<TEvent>>
  onFinish?: (context: AgentDecisionHookContext<TInput, TState, TEvaluation>) => MaybePromise<AgentHookOutput<TEvent>>
  onRunComplete?: (context: AgentHookContext<TInput, TState>) => MaybePromise<AgentHookOutput<TEvent>>
  afterIteration?: (context: AgentIterationCompleteParams<TInput, TState, TTask, TResult, TEvaluation, TUsage>) => Promise<void> | void
}

export interface AgentOptions<TInput, TState, TTask, TResult, TEvaluation, TEvent = never, TUsage = unknown> {
  planner: AgentPlanner<TState, TTask, TUsage>
  executor: AgentExecutor<TState, TResult, TEvent, TUsage>
  evaluator: AgentEvaluator<TState, TEvaluation, TUsage>
  memory: AgentMemory<TInput, TState>
  lifecycle: AgentLifecycle<TState, TTask, TResult, TEvaluation, TUsage>
  hooks?: AgentRunHooks<TInput, TState, TTask, TResult, TEvaluation, TEvent, TUsage>
}

function isAsyncIterable<TEvent>(value: AgentHookOutput<TEvent>): value is AsyncIterable<TEvent> {
  return typeof value === 'object'
    && value !== null
    && Symbol.asyncIterator in value
}

async function* emitHookOutput<TEvent>(
  output: MaybePromise<AgentHookOutput<TEvent>>,
): AsyncGenerator<TEvent, void, void> {
  const resolvedOutput = await output

  if (!resolvedOutput) {
    return
  }

  if (Array.isArray(resolvedOutput)) {
    for (const event of resolvedOutput) {
      yield event
    }
    return
  }

  if (isAsyncIterable(resolvedOutput)) {
    yield * resolvedOutput
    return
  }

  yield resolvedOutput
}

export class Agent<TInput, TState, TTask, TResult, TEvaluation, TEvent = never, TUsage = unknown> {
  private readonly planner: AgentPlanner<TState, TTask, TUsage>
  private readonly executor: AgentExecutor<TState, TResult, TEvent, TUsage>
  private readonly evaluator: AgentEvaluator<TState, TEvaluation, TUsage>
  private readonly memory: AgentMemory<TInput, TState>
  private readonly lifecycle: AgentLifecycle<TState, TTask, TResult, TEvaluation, TUsage>
  private readonly hooks?: AgentRunHooks<TInput, TState, TTask, TResult, TEvaluation, TEvent, TUsage>

  constructor(options: AgentOptions<TInput, TState, TTask, TResult, TEvaluation, TEvent, TUsage>) {
    this.planner = options.planner
    this.executor = options.executor
    this.evaluator = options.evaluator
    this.memory = options.memory
    this.lifecycle = options.lifecycle
    this.hooks = options.hooks
  }

  async *run(input: TInput): AsyncGenerator<TEvent, TState> {
    if (this.hooks?.onRunStart) {
      yield * emitHookOutput(this.hooks.onRunStart(input))
    }

    let state: TState = await this.memory.initialize(input)

    while (true) {
      state = this.lifecycle.startIteration(state)

      if (this.hooks?.onIterationStart) {
        yield * emitHookOutput(this.hooks.onIterationStart(state))
      }

      if (this.hooks?.onPlanningStart) {
        yield * emitHookOutput(this.hooks.onPlanningStart(state))
      }

      const iterationStartedAt = performance.now()
      const planningStartedAt = performance.now()
      const planResult = await this.planner.plan(state)
      const planningMs = performance.now() - planningStartedAt
      state = this.lifecycle.applyPlan(state, planResult)

      if (this.hooks?.onPlanningComplete) {
        yield * emitHookOutput(this.hooks.onPlanningComplete({
          input,
          state,
          plan: planResult,
        }))
      }

      const executionStartedAt = performance.now()
      const executionIterator = this.executor.execute(state)[Symbol.asyncIterator]()
      let executionResult: AgentExecutionResult<TState, TResult, TUsage> | undefined

      while (true) {
        const iteration = await executionIterator.next()

        if (iteration.done) {
          executionResult = iteration.value
          break
        }

        yield iteration.value
      }

      if (!executionResult) {
        throw new Error('Agent executor did not return a result.')
      }

      const executionMs = performance.now() - executionStartedAt
      state = this.lifecycle.applyExecution(state, executionResult)

      if (this.hooks?.onExecutionComplete) {
        yield * emitHookOutput(this.hooks.onExecutionComplete({
          input,
          state,
          execution: executionResult,
        }))
      }

      if (this.hooks?.onEvaluationStart) {
        yield * emitHookOutput(this.hooks.onEvaluationStart(state))
      }

      const evaluationStartedAt = performance.now()
      const evaluationResult = await this.evaluator.evaluate(state)
      const evaluationMs = performance.now() - evaluationStartedAt
      state = this.lifecycle.applyEvaluation(state, evaluationResult)

      if (this.hooks?.onEvaluationComplete) {
        yield * emitHookOutput(this.hooks.onEvaluationComplete({
          input,
          state,
          evaluation: evaluationResult,
        }))
      }

      const metrics: AgentIterationMetrics<TUsage> = {
        planningMs,
        executionMs,
        evaluationMs,
        totalMs: performance.now() - iterationStartedAt,
        planningUsage: planResult.usage,
        executionUsage: executionResult.usage,
        evaluationUsage: evaluationResult.usage,
      }

      await this.hooks?.afterIteration?.({
        input,
        state,
        plan: planResult,
        execution: executionResult,
        evaluation: evaluationResult,
        metrics,
      })

      const decision = this.lifecycle.decideNext(state, evaluationResult.evaluation)
      if (decision.state !== undefined) {
        state = decision.state
      }

      if (decision.type === 'retry') {
        if (this.hooks?.onRetry) {
          yield * emitHookOutput(this.hooks.onRetry({
            input,
            state,
            evaluation: evaluationResult.evaluation,
          }))
        }
        continue
      }

      if (this.hooks?.onFinish) {
        yield * emitHookOutput(this.hooks.onFinish({
          input,
          state,
          evaluation: evaluationResult.evaluation,
        }))
      }
      break
    }

    if (this.hooks?.onRunComplete) {
      yield * emitHookOutput(this.hooks.onRunComplete({
        input,
        state,
      }))
    }

    await this.memory.finalize?.({ input, state })

    return state
  }
}
