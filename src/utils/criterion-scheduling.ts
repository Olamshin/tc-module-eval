import { AsyncLocalStorage } from 'async_hooks';
import { EvaluationRun } from '../types';

/** Agent reviews mostly wait on the model, so a few run at once; more would mostly add provider load. */
const AGENT_REVIEW_CONCURRENCY = 3;

/** Carried on the run, and on copies of it, so a wrapped runAgentReview still identifies its scheduler. */
const SCHEDULER = Symbol('agentReviewScheduler');

interface CriterionInvocation {
  scheduler?: object;
  release(): void;
}

const currentInvocation = new AsyncLocalStorage<CriterionInvocation>();

/**
 * Runs criterion tasks in order and resolves with their results in that order. Each task starts once the previous
 * one has completed or has entered agent review through the evaluation run; work after a review may overlap later
 * tasks. Without an evaluation run, each task completes before the next starts.
 */
export async function runCriteriaInOrder<T>(tasks: Array<() => Promise<T>>, evaluationRun?: EvaluationRun): Promise<T[]> {
  const scheduler = (evaluationRun as { [SCHEDULER]?: object } | undefined)?.[SCHEDULER];
  const results: Promise<T>[] = [];
  for (const task of tasks) {
    let release!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    const result = currentInvocation.run({ scheduler, release }, task);
    results.push(result);
    await Promise.race([result.then(() => undefined, () => undefined), released]);
  }
  return Promise.all(results);
}

/** The review queue and handoff of one evaluation run. */
export function createAgentReviewScheduler(): Pick<EvaluationRun, 'runAgentReview' | 'nextAgentReviewHandoff'> {
  const scheduler = {};
  let activeReviews = 0;
  const queuedReviews: (() => void)[] = [];
  let unscheduledHandoff: (() => void) | undefined;

  const runAgentReview: EvaluationRun['runAgentReview'] = async review => {
    const invocation = currentInvocation.getStore();
    if (invocation?.scheduler === scheduler) {
      invocation.release();
    } else {
      unscheduledHandoff?.();
      unscheduledHandoff = undefined;
    }
    if (activeReviews < AGENT_REVIEW_CONCURRENCY) {
      activeReviews++;
    } else {
      await new Promise<void>(resolve => queuedReviews.push(resolve));
    }
    try {
      return await review();
    } finally {
      // Pass the slot straight to the next queued review, or free it.
      const next = queuedReviews.shift();
      if (next) next();
      else activeReviews--;
    }
  };

  return {
    runAgentReview,
    nextAgentReviewHandoff: () => new Promise<void>(resolve => { unscheduledHandoff = resolve; }),
    [SCHEDULER]: scheduler
  } as Pick<EvaluationRun, 'runAgentReview' | 'nextAgentReviewHandoff'>;
}
