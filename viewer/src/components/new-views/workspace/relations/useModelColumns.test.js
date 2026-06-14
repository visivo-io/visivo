import { renderHook, waitFor } from '@testing-library/react';
import { useModelColumns } from './useModelColumns';
import { fetchModelData } from '../../../../api/modelData';

jest.mock('../../../../api/modelData');

describe('useModelColumns', () => {
  afterEach(() => jest.clearAllMocks());

  it('fetches each model’s cached columns and keys them by model name', async () => {
    fetchModelData.mockImplementation(async name =>
      name === 'orders'
        ? { available: true, columns: ['id', 'amount'] }
        : { available: true, columns: ['id', 'email'] }
    );

    const { result } = renderHook(() => useModelColumns(['orders', 'users']));

    await waitFor(() => expect(result.current.columnsByModel.orders).toEqual(['id', 'amount']));
    expect(result.current.columnsByModel.users).toEqual(['id', 'email']);
    expect(fetchModelData).toHaveBeenCalledWith('orders');
    expect(fetchModelData).toHaveBeenCalledWith('users');
  });

  it('resolves a model with no cached data to an empty column list', async () => {
    fetchModelData.mockResolvedValue({ available: false });

    const { result } = renderHook(() => useModelColumns(['empty_model']));

    await waitFor(() => {
      expect(result.current.columnsByModel.empty_model).toEqual([]);
    });
  });

  it('swallows fetch errors and resolves to an empty list', async () => {
    fetchModelData.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useModelColumns(['broken']));

    await waitFor(() => {
      expect(result.current.columnsByModel.broken).toEqual([]);
    });
  });

  it('does not re-fetch a model it already attempted', async () => {
    fetchModelData.mockResolvedValue({ available: true, columns: ['id'] });

    const { rerender } = renderHook(({ names }) => useModelColumns(names), {
      initialProps: { names: ['orders'] },
    });
    await waitFor(() => expect(fetchModelData).toHaveBeenCalledTimes(1));

    // Re-render with the same name (new array identity) — must not re-fetch.
    rerender({ names: ['orders'] });
    await waitFor(() => expect(fetchModelData).toHaveBeenCalledTimes(1));
  });

  it('returns empty state for a non-array input', () => {
    const { result } = renderHook(() => useModelColumns(null));
    expect(result.current.columnsByModel).toEqual({});
    expect(fetchModelData).not.toHaveBeenCalled();
  });
});
