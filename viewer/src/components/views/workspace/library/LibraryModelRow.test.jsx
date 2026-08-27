import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import LibraryModelRow from './LibraryModelRow';

const withDnd = ui => <DndContext>{ui}</DndContext>;

const MODEL = { id: 'model:orders', type: 'model', name: 'orders' };
const FIELDS = {
  dimension: [{ id: 'dimension:region', type: 'dimension', name: 'region', parentModel: 'orders' }],
  metric: [{ id: 'metric:revenue', type: 'metric', name: 'revenue', parentModel: 'orders' }],
};

// Model-scoped fields used to sit flat alongside standalone ones, identical in
// every respect while obeying different rules — a nested expression may not
// contain a ref at all. Nesting them under their owner makes the relationship
// structural instead of something the user has to infer from a badge.
describe('LibraryModelRow', () => {
  test('a model with fields offers an expander', () => {
    render(withDnd(<LibraryModelRow obj={MODEL} nestedFields={FIELDS} />));
    expect(screen.getByLabelText('Expand orders')).toBeInTheDocument();
  });

  test('its fields are hidden until it is expanded', () => {
    render(withDnd(<LibraryModelRow obj={MODEL} nestedFields={FIELDS} />));
    expect(screen.queryByTestId('library-model-orders-fields')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Expand orders'));
    const list = screen.getByTestId('library-model-orders-fields');
    expect(list).toBeInTheDocument();
    expect(screen.getByTestId('library-row-dimension-region')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-metric-revenue')).toBeInTheDocument();
  });

  test('expanding and collapsing round-trips', () => {
    render(withDnd(<LibraryModelRow obj={MODEL} nestedFields={FIELDS} />));
    fireEvent.click(screen.getByLabelText('Expand orders'));
    expect(screen.getByTestId('library-model-orders-fields')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Collapse orders'));
    expect(screen.queryByTestId('library-model-orders-fields')).not.toBeInTheDocument();
  });

  test('a model that defines nothing gets no expander', () => {
    // An affordance that opens onto an empty list is a dead affordance.
    render(withDnd(<LibraryModelRow obj={MODEL} nestedFields={{ dimension: [], metric: [] }} />));
    expect(screen.queryByLabelText('Expand orders')).not.toBeInTheDocument();
  });

  test('a model with no nested data at all is still a normal row', () => {
    render(withDnd(<LibraryModelRow obj={MODEL} />));
    expect(screen.getByTestId('library-row-model-orders')).toBeInTheDocument();
    expect(screen.queryByLabelText('Expand orders')).not.toBeInTheDocument();
  });

  test('clicking a nested field selects it, like any other row', () => {
    const onClick = jest.fn();
    render(withDnd(<LibraryModelRow obj={MODEL} nestedFields={FIELDS} onClick={onClick} />));
    fireEvent.click(screen.getByLabelText('Expand orders'));
    fireEvent.click(screen.getByTestId('library-row-dimension-region'));
    // Called as (obj, event) — assert the payload, not the arity.
    expect(onClick.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'region' }));
  });
});
