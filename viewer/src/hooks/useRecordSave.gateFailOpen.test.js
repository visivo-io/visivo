/**
 * useRecordSave gate fail-open (VIS-993 canvas-persist regression).
 *
 * runSave awaited `validateRecordConfig` OUTSIDE its try/catch: a gate that
 * REJECTED (any internal AJV/registration error) crashed the debounced persist
 * — no saveX call, no 'invalid' status, an unhandled rejection, and the edit
 * silently never persisted. Fail-open policy: a gate CRASH must persist (the
 * backend Pydantic validator stays authoritative); only a real invalid VERDICT
 * blocks.
 */
import { renderHook, act } from '@testing-library/react';

import useRecordSave from './useRecordSave';
import useStore from '../stores/store';
import { validateRecordConfig } from '../components/views/workspace/validateAgainstSchema';
import { checkRefTargets } from '../components/views/workspace/refPreflight';
import { checkExpressions } from '../components/views/workspace/expressionPreflight';

jest.mock('../components/views/workspace/validateAgainstSchema', () => ({
  validateRecordConfig: jest.fn(),
  validateRecordConfigSync: jest.fn(() => null),
}));
jest.mock('../components/views/workspace/refPreflight', () => ({
  checkRefTargets: jest.fn(() => ({ valid: true, errors: [] })),
}));
jest.mock('../components/views/workspace/expressionPreflight', () => ({
  checkExpressions: jest.fn(async () => ({ valid: true, errors: [] })),
}));

let consoleErrorSpy;
beforeEach(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  // clearAllMocks (afterEach) clears calls but NOT implementations — reset the
  // two helper layers to their valid defaults so a throw/reject set by one test
  // cannot leak into the next.
  checkRefTargets.mockImplementation(() => ({ valid: true, errors: [] }));
  checkExpressions.mockImplementation(async () => ({ valid: true, errors: [] }));
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
  jest.clearAllMocks();
});

test('a REJECTING validation gate fails open: saveX still fires', async () => {
  validateRecordConfig.mockRejectedValue(new Error('gate exploded'));
  const saveFn = jest.fn(() => Promise.resolve({ success: true }));
  useStore.setState({
    markdowns: [{ name: 'notes', config: { name: 'notes', content: 'hi' } }],
    saveMarkdown: saveFn,
    saveActivityCount: 0,
    lastSaveFailed: false,
  });

  const { result } = renderHook(() => useRecordSave('markdown', 'notes', { delay: 0 }));

  await act(async () => {
    await result.current.saveNow({ name: 'notes', content: 'edited' });
  });

  expect(saveFn).toHaveBeenCalledTimes(1);
  expect(saveFn).toHaveBeenCalledWith('notes', expect.objectContaining({ content: 'edited' }));
  expect(result.current.status).not.toBe('invalid');
});

test('a REJECTING expression layer fails open too (all 3 layers in one try/catch)', async () => {
  // The expression pre-flight is fail-open internally, but a defensive guard:
  // if it ever rejects (e.g. a future refactor throws before its own catch),
  // the persist must still fire — it must not escape runSave uncaught and
  // silently swallow the save, which is the exact canvas-persist bug shape.
  validateRecordConfig.mockResolvedValue({ valid: true, errors: [] });
  checkExpressions.mockRejectedValue(new Error('expression endpoint exploded'));
  const saveFn = jest.fn(() => Promise.resolve({ success: true }));
  useStore.setState({
    metrics: [{ name: 'm', config: { name: 'm', expression: 'SUM(x)' } }],
    saveMetric: saveFn,
    saveActivityCount: 0,
    lastSaveFailed: false,
  });

  const { result } = renderHook(() => useRecordSave('metric', 'm', { delay: 0 }));

  await act(async () => {
    await result.current.saveNow({ name: 'm', expression: 'SUM(y)' });
  });

  expect(saveFn).toHaveBeenCalledTimes(1);
  expect(result.current.status).not.toBe('invalid');
});

test('a THROWING ref layer fails open too', async () => {
  validateRecordConfig.mockResolvedValue({ valid: true, errors: [] });
  checkRefTargets.mockImplementation(() => {
    throw new Error('ref walk exploded');
  });
  const saveFn = jest.fn(() => Promise.resolve({ success: true }));
  useStore.setState({
    markdowns: [{ name: 'notes', config: { name: 'notes', content: 'hi' } }],
    saveMarkdown: saveFn,
    saveActivityCount: 0,
    lastSaveFailed: false,
  });

  const { result } = renderHook(() => useRecordSave('markdown', 'notes', { delay: 0 }));

  await act(async () => {
    await result.current.saveNow({ name: 'notes', content: 'edited' });
  });

  expect(saveFn).toHaveBeenCalledTimes(1);
  expect(result.current.status).not.toBe('invalid');
});

test('a real INVALID verdict still blocks (the gate is not weakened)', async () => {
  validateRecordConfig.mockResolvedValue({
    valid: false,
    errors: [{ path: 'align', message: 'must be equal to one of the allowed values', keyword: 'enum' }],
  });
  const saveFn = jest.fn(() => Promise.resolve({ success: true }));
  useStore.setState({
    markdowns: [{ name: 'notes', config: { name: 'notes', content: 'hi' } }],
    saveMarkdown: saveFn,
    saveActivityCount: 0,
    lastSaveFailed: false,
  });

  const { result } = renderHook(() => useRecordSave('markdown', 'notes', { delay: 0 }));

  await act(async () => {
    await result.current.saveNow({ name: 'notes', content: 'hi', align: 'diagonal' });
  });

  expect(saveFn).not.toHaveBeenCalled();
  expect(result.current.status).toBe('invalid');
});
