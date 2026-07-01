import { renderHook, waitFor } from '@testing-library/react';
import { useModelColumns } from './useModelColumns';
import { fetchModelColumnNames } from '../../../../api/modelSchemaJobs';
import { fetchModelData } from '../../../../api/modelData';

jest.mock('../../../../api/modelSchemaJobs');
jest.mock('../../../../api/modelData');

describe('useModelColumns', () => {
  beforeEach(() => {
    // Default: schema artifact has the columns (the happy, schema-first path).
    fetchModelColumnNames.mockResolvedValue([]);
    fetchModelData.mockResolvedValue({ available: false });
  });
  afterEach(() => jest.clearAllMocks());

  it('reads each model’s columns from the SCHEMA artifact and keys them by name', async () => {
    fetchModelColumnNames.mockImplementation(async name =>
      name === 'orders' ? ['id', 'amount'] : ['id', 'email']
    );

    const { result } = renderHook(() => useModelColumns(['orders', 'users']));

    await waitFor(() => expect(result.current.columnsByModel.orders).toEqual(['id', 'amount']));
    expect(result.current.columnsByModel.users).toEqual(['id', 'email']);
    expect(fetchModelColumnNames).toHaveBeenCalledWith('orders');
    expect(fetchModelColumnNames).toHaveBeenCalledWith('users');
    // Schema had columns → data fallback never invoked.
    expect(fetchModelData).not.toHaveBeenCalled();
  });

  it('falls back to model DATA when the schema artifact is empty', async () => {
    fetchModelColumnNames.mockResolvedValue([]);
    fetchModelData.mockResolvedValue({ available: true, columns: ['id', 'fallback_col'] });

    const { result } = renderHook(() => useModelColumns(['legacy_model']));

    await waitFor(() =>
      expect(result.current.columnsByModel.legacy_model).toEqual(['id', 'fallback_col'])
    );
    expect(fetchModelData).toHaveBeenCalledWith('legacy_model');
  });

  it('resolves a model with neither schema nor data to an empty column list', async () => {
    fetchModelColumnNames.mockResolvedValue([]);
    fetchModelData.mockResolvedValue({ available: false });

    const { result } = renderHook(() => useModelColumns(['empty_model']));

    await waitFor(() => {
      expect(result.current.columnsByModel.empty_model).toEqual([]);
    });
  });

  it('swallows fetch errors and resolves to an empty list', async () => {
    fetchModelColumnNames.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useModelColumns(['broken']));

    await waitFor(() => {
      expect(result.current.columnsByModel.broken).toEqual([]);
    });
  });

  it('does not re-fetch a model it already attempted', async () => {
    fetchModelColumnNames.mockResolvedValue(['id']);

    const { rerender } = renderHook(({ names }) => useModelColumns(names), {
      initialProps: { names: ['orders'] },
    });
    await waitFor(() => expect(fetchModelColumnNames).toHaveBeenCalledTimes(1));

    // Re-render with the same name (new array identity) — must not re-fetch.
    rerender({ names: ['orders'] });
    await waitFor(() => expect(fetchModelColumnNames).toHaveBeenCalledTimes(1));
  });

  it('returns empty state for a non-array input', () => {
    const { result } = renderHook(() => useModelColumns(null));
    expect(result.current.columnsByModel).toEqual({});
    expect(fetchModelColumnNames).not.toHaveBeenCalled();
  });
});
