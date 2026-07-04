import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DndContext } from '@dnd-kit/core';
import ObjectList from './ObjectList';
import { ObjectStatus } from '../../../stores/store';

const wrap = (ui) => render(<DndContext>{ui}</DndContext>);

const makeObjects = (...items) => items;

describe('ObjectList', () => {
  const defaultObjects = makeObjects(
    { name: 'alpha', status: ObjectStatus.PUBLISHED },
    { name: 'beta', status: ObjectStatus.MODIFIED },
    { name: 'gamma', status: ObjectStatus.NEW },
  );

  it('renders section header with count', () => {
    wrap(<ObjectList objects={defaultObjects} title="Insights" objectType="insight" onSelect={() => {}} />);
    expect(screen.getByText('Insights (3)')).toBeInTheDocument();
  });

  it('renders empty state when objects is empty', () => {
    render(<ObjectList objects={[]} title="Insights" objectType="insight" onSelect={() => {}} />);
    expect(screen.getByText(/no insights found/i)).toBeInTheDocument();
  });

  it('click on row invokes onSelect', () => {
    const onSelect = jest.fn();
    wrap(
      <ObjectList
        objects={defaultObjects}
        title="Insights"
        objectType="insight"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('alpha'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'alpha' }));
  });

  it('delete button on new objects invokes onDelete and stops propagation', () => {
    const onSelect = jest.fn();
    const onDelete = jest.fn();
    wrap(
      <ObjectList
        objects={defaultObjects}
        title="Insights"
        objectType="insight"
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByTestId('delete-insight-gamma'));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ name: 'gamma' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reset button on modified objects invokes onReset and stops propagation', () => {
    const onSelect = jest.fn();
    const onReset = jest.fn();
    wrap(
      <ObjectList
        objects={defaultObjects}
        title="Insights"
        objectType="insight"
        onSelect={onSelect}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByTestId('reset-insight-beta'));
    expect(onReset).toHaveBeenCalledWith(expect.objectContaining({ name: 'beta' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  describe('draggableType prop', () => {
    it('renders rows with data-testid draggable-insight-<name> when set', () => {
      wrap(
        <ObjectList
          objects={defaultObjects}
          title="Insights"
          objectType="insight"
          onSelect={() => {}}
          draggableType="insight"
        />,
      );
      expect(screen.getByTestId('draggable-insight-alpha')).toBeInTheDocument();
      expect(screen.getByTestId('draggable-insight-beta')).toBeInTheDocument();
      expect(screen.getByTestId('draggable-insight-gamma')).toBeInTheDocument();
    });

    it('does not render draggable test ids when draggableType is not set', () => {
      wrap(
        <ObjectList
          objects={defaultObjects}
          title="Insights"
          objectType="insight"
          onSelect={() => {}}
        />,
      );
      expect(screen.queryByTestId('draggable-insight-alpha')).not.toBeInTheDocument();
    });

    it('click still invokes onSelect when draggableType is set', () => {
      const onSelect = jest.fn();
      wrap(
        <ObjectList
          objects={defaultObjects}
          title="Insights"
          objectType="insight"
          onSelect={onSelect}
          draggableType="insight"
        />,
      );
      fireEvent.click(screen.getByTestId('draggable-insight-alpha'));
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'alpha' }));
    });

    it('delete button still works when draggableType is set', () => {
      const onDelete = jest.fn();
      wrap(
        <ObjectList
          objects={defaultObjects}
          title="Insights"
          objectType="insight"
          onSelect={() => {}}
          onDelete={onDelete}
          draggableType="insight"
        />,
      );
      fireEvent.click(screen.getByTestId('delete-insight-gamma'));
      expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ name: 'gamma' }));
    });

    it('reset button still works when draggableType is set', () => {
      const onReset = jest.fn();
      wrap(
        <ObjectList
          objects={defaultObjects}
          title="Insights"
          objectType="insight"
          onSelect={() => {}}
          onReset={onReset}
          draggableType="insight"
        />,
      );
      fireEvent.click(screen.getByTestId('reset-insight-beta'));
      expect(onReset).toHaveBeenCalledWith(expect.objectContaining({ name: 'beta' }));
    });
  });
});
