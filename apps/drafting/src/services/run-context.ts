import { AsyncLocalStorage } from 'async_hooks';

/**
 * T-681a (Arjun, option b): the generation run a piece of work belongs to,
 * carried through awaits, stream callbacks and Promise.all by
 * AsyncLocalStorage, so an llm_call line can name its run without the run id
 * being passed through every function. Ids and counts only: never user text
 * and never a user id, because logs go to third parties.
 */
export interface RunContext {
  runId: string;
  runSequence: number;
  /** The template or rule pack id of the run, where there is one. */
  templateId?: string;
  /** T-705 (Vikram): set only on a revision attempt: free or paid. */
  revision?: 'free' | 'paid';
}

const storage = new AsyncLocalStorage<RunContext>();

/** Runs `fn` with `ctx` as the current run; work started inside it inherits the context. */
export function runWithRunContext<T>(ctx: RunContext, fn: () => T): T {
  const store: RunContext = {
    runId: ctx.runId,
    runSequence: ctx.runSequence,
    ...(ctx.templateId ? { templateId: ctx.templateId } : {}),
    ...(ctx.revision ? { revision: ctx.revision } : {}),
  };
  return storage.run(store, fn);
}

/** The current run, or undefined outside one. */
export function currentRunContext(): RunContext | undefined {
  return storage.getStore();
}
