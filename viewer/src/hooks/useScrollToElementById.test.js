import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import useScrollToElementById from './useScrollToElementById';

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
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  test('should scroll to element and update search params', async () => {
    const elementId = 'test-element';

    // Setup test element in DOM
    const element = document.createElement('div');
    element.setAttribute('id', elementId);
    element.scrollIntoView = jest.fn();
    document.body.appendChild(element);

    const deleteMock = jest.fn();
    const setSearchParamsMock = jest.fn();

    useSearchParams.mockReturnValue([
      { delete: deleteMock },
      setSearchParamsMock,
    ]);

    const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

    renderHook(() => useScrollToElementById(elementId), { wrapper });

    await waitFor(() => {
      expect(element.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });

    expect(deleteMock).toHaveBeenCalledWith('element_id');
    expect(setSearchParamsMock).toHaveBeenCalled();

    document.body.removeChild(element);
  });

  test('should not scroll when elementId is not provided', async () => {
    const setSearchParamsMock = jest.fn();

    useSearchParams.mockReturnValue([
      { delete: jest.fn() },
      setSearchParamsMock,
    ]);

    const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

    renderHook(() => useScrollToElementById(null), { wrapper });

    await waitFor(() => {
      expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    expect(setSearchParamsMock).not.toHaveBeenCalled();
  });
});
