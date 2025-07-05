import { renderHook, act } from '@testing-library/react';
import { useCopyToClipboard } from './useCopyToClipboard';
import copy from 'copy-to-clipboard';

jest.mock('copy-to-clipboard', () => jest.fn());

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize with Copy tooltip', () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.toolTip).toBe('Copy');
  });

  test('should update tooltip to Copied when copy is successful', () => {
    copy.mockReturnValue(true); // Simulate successful copy

    const { result } = renderHook(() => useCopyToClipboard());

    act(() => {
      result.current.copyText('Some text');
    });

    expect(copy).toHaveBeenCalledWith('Some text');
    expect(result.current.toolTip).toBe('Copied');
  });

  test('should not update tooltip if copy fails', () => {
    copy.mockReturnValue(false); // Simulate failed copy

    const { result } = renderHook(() => useCopyToClipboard());

    act(() => {
      result.current.copyText('Some text');
    });

    expect(copy).toHaveBeenCalledWith('Some text');
    expect(result.current.toolTip).toBe('Copy'); // Should stay 'Copy' on failure
  });

  test('should reset tooltip to Copy', () => {
    copy.mockReturnValue(true);

    const { result } = renderHook(() => useCopyToClipboard());

    act(() => {
      result.current.copyText('Some text');
    });

    expect(result.current.toolTip).toBe('Copied');

    act(() => {
      result.current.resetToolTip();
    });

    expect(result.current.toolTip).toBe('Copy');
  });
});
