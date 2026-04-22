import { renderHook, act } from '@testing-library/react';
import { usePanelResize } from './usePanelResize';

describe('usePanelResize', () => {
  it('returns initial ratio', () => {
    const containerRef = { current: null };
    const { result } = renderHook(() =>
      usePanelResize({ containerRef, initialRatio: 0.3 })
    );
    expect(result.current.ratio).toBe(0.3);
    expect(result.current.isResizing).toBe(false);
  });

  it('defaults to 0.5 ratio', () => {
    const containerRef = { current: null };
    const { result } = renderHook(() => usePanelResize({ containerRef }));
    expect(result.current.ratio).toBe(0.5);
  });

  it('sets isResizing on mousedown', () => {
    const containerRef = { current: null };
    const { result } = renderHook(() => usePanelResize({ containerRef }));

    act(() => {
      result.current.handleMouseDown({ preventDefault: jest.fn() });
    });

    expect(result.current.isResizing).toBe(true);
  });

  it('updates ratio on horizontal mousemove', () => {
    const containerRef = {
      current: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 1000,
          height: 500,
        }),
      },
    };

    const { result } = renderHook(() =>
      usePanelResize({
        containerRef,
        direction: 'horizontal',
        initialRatio: 0.5,
        minRatio: 0.2,
        maxRatio: 0.8,
        minSize: 100,
      })
    );

    act(() => {
      result.current.handleMouseDown({ preventDefault: jest.fn() });
    });

    act(() => {
      const event = new MouseEvent('mousemove', { clientX: 300 });
      document.dispatchEvent(event);
    });

    expect(result.current.ratio).toBe(0.3);
  });

  it('updates ratio on vertical mousemove', () => {
    const containerRef = {
      current: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 500,
          height: 1000,
        }),
      },
    };

    const { result } = renderHook(() =>
      usePanelResize({
        containerRef,
        direction: 'vertical',
        initialRatio: 0.5,
        minRatio: 0.2,
        maxRatio: 0.8,
        minSize: 100,
      })
    );

    act(() => {
      result.current.handleMouseDown({ preventDefault: jest.fn() });
    });

    act(() => {
      const event = new MouseEvent('mousemove', { clientY: 600 });
      document.dispatchEvent(event);
    });

    expect(result.current.ratio).toBe(0.6);
  });

  it('clamps ratio to maxRatio', () => {
    const containerRef = {
      current: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 1000,
          height: 500,
        }),
      },
    };

    const { result } = renderHook(() =>
      usePanelResize({
        containerRef,
        direction: 'horizontal',
        maxRatio: 0.7,
        minRatio: 0.2,
        minSize: 100,
      })
    );

    act(() => {
      result.current.handleMouseDown({ preventDefault: jest.fn() });
    });

    act(() => {
      const event = new MouseEvent('mousemove', { clientX: 900 });
      document.dispatchEvent(event);
    });

    expect(result.current.ratio).toBe(0.7);
  });

  it('clamps ratio to minRatio', () => {
    const containerRef = {
      current: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 1000,
          height: 500,
        }),
      },
    };

    const { result } = renderHook(() =>
      usePanelResize({
        containerRef,
        direction: 'horizontal',
        maxRatio: 0.8,
        minRatio: 0.3,
        minSize: 100,
      })
    );

    act(() => {
      result.current.handleMouseDown({ preventDefault: jest.fn() });
    });

    act(() => {
      const event = new MouseEvent('mousemove', { clientX: 100 });
      document.dispatchEvent(event);
    });

    expect(result.current.ratio).toBe(0.3);
  });

  it('stops resizing on mouseup', () => {
    const containerRef = { current: null };
    const { result } = renderHook(() => usePanelResize({ containerRef }));

    act(() => {
      result.current.handleMouseDown({ preventDefault: jest.fn() });
    });

    expect(result.current.isResizing).toBe(true);

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.isResizing).toBe(false);
  });
});
