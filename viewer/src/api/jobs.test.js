// The one polling loop, shared by every on-demand op. It existed three times
// before this: here, in api/explorer.js, and in api/modelQueryJobs.js.
import { pollJob } from './jobs';

const seq = (...envelopes) => {
  const queue = [...envelopes];
  return jest.fn(async () => queue.shift());
};

describe('pollJob', () => {
  it('polls until the job completes and returns its result', async () => {
    const fetchStatus = seq(
      { status: 'queued' },
      { status: 'running' },
      { status: 'completed', result: { rows: [1, 2] } }
    );

    await expect(pollJob(fetchStatus, { intervalMs: 1 })).resolves.toMatchObject({
      ok: true,
      result: { rows: [1, 2] },
    });
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it('polls immediately, so an already-finished job pays no interval', async () => {
    // Sleeping first would put a floor under every op. Locally most of them
    // finish before the first interval would have elapsed.
    const fetchStatus = seq({ status: 'completed', result: 'x' });
    const started = Date.now();

    await pollJob(fetchStatus, { intervalMs: 5000 });

    expect(Date.now() - started).toBeLessThan(1000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('reports a failed job rather than throwing', async () => {
    await expect(
      pollJob(seq({ status: 'failed', error: 'query exploded' }), { intervalMs: 1 })
    ).resolves.toMatchObject({ ok: false, error: 'query exploded' });
  });

  it('reports a cancelled job', async () => {
    await expect(
      pollJob(seq({ status: 'cancelled' }), { intervalMs: 1 })
    ).resolves.toMatchObject({ ok: false, error: 'Job cancelled' });
  });

  it('turns a throwing fetch into an outcome', async () => {
    const fetchStatus = jest.fn(async () => {
      throw new Error('Lost track of the job');
    });
    await expect(pollJob(fetchStatus, { intervalMs: 1 })).resolves.toEqual({
      ok: false,
      error: 'Lost track of the job',
    });
  });

  it('gives up at the deadline', async () => {
    const fetchStatus = jest.fn(async () => ({ status: 'running' }));
    await expect(
      pollJob(fetchStatus, { intervalMs: 1, timeoutMs: 0 })
    ).resolves.toMatchObject({ ok: false, error: 'Timed out waiting for the job' });
    // Polled once before deciding — a job that finished during the last
    // interval should still be seen.
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('reports every envelope to onProgress, terminal one included', async () => {
    const onProgress = jest.fn();
    await pollJob(seq({ status: 'running', progress: 0.5 }, { status: 'completed' }), {
      intervalMs: 1,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, { status: 'running', progress: 0.5 });
    expect(onProgress).toHaveBeenLastCalledWith({ status: 'completed' });
  });

  it('hands back the raw envelope alongside the result', async () => {
    // pollModelQueryJob returns the whole envelope, not just the result.
    const envelope = { status: 'completed', rows: [], progress: 1 };
    const outcome = await pollJob(seq(envelope), { intervalMs: 1 });
    expect(outcome.job).toEqual(envelope);
  });
});
