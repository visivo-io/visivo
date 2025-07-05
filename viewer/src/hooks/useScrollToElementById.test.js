import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import useScrollToElementById from './useScrollToElementById';

window.HTMLElement.prototype.scrollIntoView = jest.fn();

jest.mock('react-router-dom', () => {
  const originalModule = jest.requireActual('react-router-dom');
  return {
    ...originalModule,
    useSearchParams: jest.fn(),
  };
});

describe('useScrollToElementById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should scroll to element and update search params', async () => {
    // Setup the element in the DOM
    const elementId = 'test-element';
    const element = document.createElement('div');
    element.setAttribute('id', elementId);
    document.body.appendChild(element);

    // Mock search params
    const deleteMock = jest.fn();
    const setSearchParamsMock = jest.fn();

    useSearchParams.mockReturnValue([
      { delete: deleteMock },
      setSearchParamsMock,
    ]);

    const { result } = renderHook(() => useScrollToElementById(elementId), { wrapper: MemoryRouter });

    // Wait until scrollIntoView has been called
    await waitFor(() => {
      expect(element.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });

    // Check that searchParams.delete was called to clean URL
    expect(deleteMock).toHaveBeenCalledWith('element_id');
    expect(setSearchParamsMock).toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(element);
  });

  test('should not scroll when elementId is not provided', async () => {
    const setSearchParamsMock = jest.fn();

    useSearchParams.mockReturnValue([
      { delete: jest.fn() },
      setSearchParamsMock,
    ]);

    const { result } = renderHook(() => useScrollToElementById(null), { wrapper: MemoryRouter });

    await waitFor(() => {
      expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    });
    expect(setSearchParamsMock).not.toHaveBeenCalled();
  });
});
