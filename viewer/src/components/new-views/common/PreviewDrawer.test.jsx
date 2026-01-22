import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PreviewDrawer from './PreviewDrawer';
import useStore from '../../../stores/store';

// Mock the store
jest.mock('../../../stores/store');

describe('PreviewDrawer', () => {
  const mockSetPreviewDrawerWidth = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Default store implementation
    useStore.mockImplementation(selector => {
      const state = {
        previewDrawerWidth: 500,
        setPreviewDrawerWidth: mockSetPreviewDrawerWidth,
      };
      return typeof selector === 'function' ? selector(state) : state;
    });
  });

  it('renders with title and children', () => {
    render(
      <PreviewDrawer isOpen={true} title="Test Preview">
        <div>Preview Content</div>
      </PreviewDrawer>
    );

    expect(screen.getByText('Test Preview')).toBeInTheDocument();
    expect(screen.getByText('Preview Content')).toBeInTheDocument();
  });

  it('uses default title when not provided', () => {
    render(
      <PreviewDrawer isOpen={true}>
        <div>Content</div>
      </PreviewDrawer>
    );

    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('applies correct width from store', () => {
    render(
      <PreviewDrawer isOpen={true} title="Test">
        <div>Content</div>
      </PreviewDrawer>
    );

    const drawer = screen.getByTestId('preview-drawer');
    expect(drawer).toHaveStyle({ width: '500px' });
  });

  it('uses defaultWidth when store width is not set', () => {
    useStore.mockImplementation(selector => {
      const state = {
        previewDrawerWidth: null,
        setPreviewDrawerWidth: mockSetPreviewDrawerWidth,
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(
      <PreviewDrawer isOpen={true} title="Test" defaultWidth={600}>
        <div>Content</div>
      </PreviewDrawer>
    );

    const drawer = screen.getByTestId('preview-drawer');
    expect(drawer).toHaveStyle({ width: '600px' });
  });

  it('hides drawer when isOpen is false', () => {
    render(
      <PreviewDrawer isOpen={false} title="Test">
        <div>Content</div>
      </PreviewDrawer>
    );

    const drawer = screen.getByTestId('preview-drawer');
    expect(drawer).toHaveStyle({ transform: 'translateX(500px)' });
  });

  it('shows drawer when isOpen is true', () => {
    render(
      <PreviewDrawer isOpen={true} title="Test">
        <div>Content</div>
      </PreviewDrawer>
    );

    const drawer = screen.getByTestId('preview-drawer');
    expect(drawer).toHaveStyle({ transform: 'translateX(0)' });
  });

  it('renders resize handle', () => {
    render(
      <PreviewDrawer isOpen={true} title="Test">
        <div>Content</div>
      </PreviewDrawer>
    );

    const resizeHandle = screen.getByTestId('resize-handle');
    expect(resizeHandle).toBeInTheDocument();
    expect(resizeHandle).toHaveClass('cursor-ew-resize');
  });

  it('starts resizing on mousedown', () => {
    render(
      <PreviewDrawer isOpen={true} title="Test">
        <div>Content</div>
      </PreviewDrawer>
    );

    const resizeHandle = screen.getByTestId('resize-handle');
    fireEvent.mouseDown(resizeHandle);

    // Check that resize handle gets active styling
    expect(resizeHandle).toHaveClass('bg-gray-400');
  });

  it('updates width on resize drag', async () => {
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    render(
      <PreviewDrawer isOpen={true} title="Test" editPanelWidth={384}>
        <div>Content</div>
      </PreviewDrawer>
    );

    const resizeHandle = screen.getByTestId('resize-handle');

    // Start resize
    fireEvent.mouseDown(resizeHandle, { clientX: 500 });

    // Simulate mouse move
    fireEvent.mouseMove(document, { clientX: 400 });

    await waitFor(() => {
      expect(mockSetPreviewDrawerWidth).toHaveBeenCalled();
    });
  });

  it('stops resizing on mouseup', async () => {
    render(
      <PreviewDrawer isOpen={true} title="Test">
        <div>Content</div>
      </PreviewDrawer>
    );

    const resizeHandle = screen.getByTestId('resize-handle');

    // Start resize
    fireEvent.mouseDown(resizeHandle, { clientX: 500 });

    // End resize
    fireEvent.mouseUp(document);

    await waitFor(() => {
      // After mouseup, handle should not have active styling
      expect(resizeHandle).not.toHaveClass('bg-gray-400');
    });
  });

  it('respects minWidth constraint', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    render(
      <PreviewDrawer isOpen={true} title="Test" minWidth={300} editPanelWidth={384}>
        <div>Content</div>
      </PreviewDrawer>
    );

    const resizeHandle = screen.getByTestId('resize-handle');

    // Start resize
    fireEvent.mouseDown(resizeHandle, { clientX: 500 });

    // Try to resize smaller than minWidth
    fireEvent.mouseMove(document, { clientX: 700 });

    await waitFor(() => {
      expect(mockSetPreviewDrawerWidth).toHaveBeenCalled();
    });

    // Check the last call respects minWidth
    const calls = mockSetPreviewDrawerWidth.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBeGreaterThanOrEqual(300);
  });

  it('respects maxWidth constraint', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    render(
      <PreviewDrawer isOpen={true} title="Test" maxWidth={800} editPanelWidth={384}>
        <div>Content</div>
      </PreviewDrawer>
    );

    const resizeHandle = screen.getByTestId('resize-handle');

    // Start resize
    fireEvent.mouseDown(resizeHandle, { clientX: 500 });

    // Try to resize larger than maxWidth
    fireEvent.mouseMove(document, { clientX: 100 });

    await waitFor(() => {
      expect(mockSetPreviewDrawerWidth).toHaveBeenCalled();
    });

    // Check the last call respects maxWidth
    const calls = mockSetPreviewDrawerWidth.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBeLessThanOrEqual(800);
  });

  it('renders visibility icon in header', () => {
    render(
      <PreviewDrawer isOpen={true} title="Test">
        <div>Content</div>
      </PreviewDrawer>
    );

    expect(screen.getByTestId('preview-icon')).toBeInTheDocument();
  });

  it('positions drawer relative to edit panel width', () => {
    const editPanelWidth = 400;
    render(
      <PreviewDrawer isOpen={true} title="Test" editPanelWidth={editPanelWidth}>
        <div>Content</div>
      </PreviewDrawer>
    );

    const drawer = screen.getByTestId('preview-drawer');
    expect(drawer).toHaveStyle({ right: `${editPanelWidth}px` });
  });

  it('renders small pill indicator on resize handle', () => {
    render(
      <PreviewDrawer isOpen={true} title="Test">
        <div>Content</div>
      </PreviewDrawer>
    );

    const pill = screen.getByTestId('resize-pill');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass('rounded-full');
  });
});
