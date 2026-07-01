import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import LevelGroup from './LevelGroup';

const group = {
  levelKey: 'level:0',
  title: 'Organization',
  levelValue: 'Organization',
  dashboards: [
    { name: 'exec', tags: [], itemCount: 3 },
    { name: 'rev', tags: [], itemCount: 5 },
  ],
};

const renderGroup = (props = {}) =>
  render(
    <DndContext>
      <LevelGroup group={group} collapsed={false} onToggle={() => {}} {...props} />
    </DndContext>
  );

describe('LevelGroup', () => {
  test('renders the header title, count and a drop target with its tiles', () => {
    renderGroup();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('· 2 dashboards')).toBeInTheDocument();
    expect(screen.getByTestId('level-group-dropzone-level:0')).toBeInTheDocument();
    expect(screen.getByTestId('project-tile-exec')).toBeInTheDocument();
    expect(screen.getByTestId('project-tile-rev')).toBeInTheDocument();
  });

  test('collapsing hides the tile grid', () => {
    renderGroup({ collapsed: true });
    expect(screen.queryByTestId('level-group-dropzone-level:0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-tile-exec')).not.toBeInTheDocument();
  });

  test('toggle button invokes onToggle', () => {
    const onToggle = jest.fn();
    renderGroup({ onToggle });
    fireEvent.click(screen.getByTestId('level-group-header-level:0-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('singular count copy for a single dashboard', () => {
    render(
      <DndContext>
        <LevelGroup
          group={{ ...group, dashboards: [{ name: 'only', tags: [] }] }}
          collapsed={false}
          onToggle={() => {}}
        />
      </DndContext>
    );
    expect(screen.getByText('· 1 dashboard')).toBeInTheDocument();
  });

  test('empty group renders a drag-here placeholder', () => {
    render(
      <DndContext>
        <LevelGroup
          group={{ ...group, dashboards: [] }}
          collapsed={false}
          onToggle={() => {}}
        />
      </DndContext>
    );
    expect(screen.getByText('Drag a dashboard here')).toBeInTheDocument();
  });
});
