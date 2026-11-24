import { fetchRuns } from '../../api/runs';
import { ACTIVE_RUN_STATES } from '../../stores/runStore';
import { extractRunError, findLatestRunFailureFor } from '../../stores/runFailures';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The ids of the project's runs right now, or null where there is no run model. */
export async function currentRunIds(projectId) {
  try {
    return new Set((await fetchRuns(projectId)).map(run => run.id));
  } catch (err) {
    return null;
  }
}

/**
 * Follow the run a source save started: the newest run not in `before`.
 *
 * A canceled run was superseded, so the next new run takes its place. If no new
 * run appears within `appearWithinMs`, the save started none and there is
 * nothing to wait for.
 *
 * Resolves to {outcome: 'succeeded' | 'failed' | 'none' | 'cancelled', error?}.
 */
export async function waitForSourceRun({
  projectId,
  before,
  sourceName,
  isCancelled = () => false,
  appearWithinMs = 30000,
  intervalMs = 2000,
  sleep = pause,
}) {
  if (!before) return { outcome: 'none' };
  const passed = new Set(before);
  let waited = 0;
  for (;;) {
    if (isCancelled()) return { outcome: 'cancelled' };
    let runs;
    try {
      runs = await fetchRuns(projectId);
    } catch (err) {
      return { outcome: 'none' };
    }
    if (isCancelled()) return { outcome: 'cancelled' };
    const run = runs.find(r => !passed.has(r.id));
    if (run?.state === 'succeeded') return { outcome: 'succeeded' };
    if (run?.state === 'failed') {
      const failure = findLatestRunFailureFor([run], sourceName);
      return { outcome: 'failed', error: failure?.error ?? extractRunError(run.error_json) };
    }
    if (run && !ACTIVE_RUN_STATES.includes(run.state)) {
      passed.add(run.id);
      waited = 0;
      continue;
    }
    if (!run) {
      if (waited >= appearWithinMs) return { outcome: 'none' };
      waited += intervalMs;
    }
    await sleep(intervalMs);
  }
}
