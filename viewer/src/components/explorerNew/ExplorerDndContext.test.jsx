import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerDndContext from './ExplorerDndContext';
import useStore from '../../stores/store';

// Mock @dnd-kit/core
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }) => (
    <div data-testid="dnd-context" data-ondragend={!!onDragEnd}>
      {children}
    </div>
  ),
  DragOverlay: ({ children }) => (
    <div data-testid="drag-overlay-container">{children}</div>
  ),
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}));

describe('ExplorerDndContext', () => {
  beforeEach(() => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerComputedColumns: [],
    });
  });

  it('renders DndContext wrapper around children', () => {
    render(
      <ExplorerDndContext>
        <div data-testid="child">Content</div>
      </ExplorerDndContext>
    );

    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders DragOverlay container', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    expect(screen.getByTestId('drag-overlay-container')).toBeInTheDocument();
  });

  it('has onDragEnd handler', () => {
    render(
      <ExplorerDndContext>
        <div>Content</div>
      </ExplorerDndContext>
    );

    expect(screen.getByTestId('dnd-context').dataset.ondragend).toBe('true');
  });
});
