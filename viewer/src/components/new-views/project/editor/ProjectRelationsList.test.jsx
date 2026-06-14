/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProjectRelationsList, { summarizeRelation } from './ProjectRelationsList';

const makeRelation = (name, condition, join_type = 'inner') => ({
  name,
  status: 'PUBLISHED',
  config: { join_type, condition },
});

const RELATIONS = [
  makeRelation(
    'orders_to_customers',
    '${ref(orders).customer_id} = ${ref(customers).id}',
    'left'
  ),
  makeRelation('local_to_local', '${ref(model_a).id} = ${ref(model_b).id}'),
];

describe('ProjectRelationsList', () => {
  test('renders a row per relation from the seeded collection', () => {
    render(<ProjectRelationsList relations={RELATIONS} onOpenRelation={jest.fn()} />);
    expect(screen.getByTestId('project-relations-list')).toBeInTheDocument();
    expect(screen.getByTestId('project-relations-row-orders_to_customers')).toBeInTheDocument();
    expect(screen.getByTestId('project-relations-row-local_to_local')).toBeInTheDocument();
  });

  test('rows are sorted alphabetically by name', () => {
    render(<ProjectRelationsList relations={RELATIONS} onOpenRelation={jest.fn()} />);
    const rows = screen.getAllByTestId(/^project-relations-row-[^-]+$/);
    const ids = rows.map(r => r.getAttribute('data-testid'));
    expect(ids).toEqual([
      'project-relations-row-local_to_local',
      'project-relations-row-orders_to_customers',
    ]);
  });

  test('summarizes the join with the join type and the referenced models', () => {
    render(<ProjectRelationsList relations={RELATIONS} onOpenRelation={jest.fn()} />);
    const row = screen.getByTestId('project-relations-row-orders_to_customers');
    // join type chip
    expect(within(row).getByText('left')).toBeInTheDocument();
    // models derived from the ${ref(model).field} condition
    expect(
      within(row).getByTestId('project-relations-row-orders_to_customers-models')
    ).toHaveTextContent('orders ↔ customers');
  });

  test('clicking a row deep-links via onOpenRelation with the relation name', () => {
    const onOpenRelation = jest.fn();
    render(<ProjectRelationsList relations={RELATIONS} onOpenRelation={onOpenRelation} />);
    fireEvent.click(screen.getByTestId('project-relations-row-local_to_local'));
    expect(onOpenRelation).toHaveBeenCalledTimes(1);
    expect(onOpenRelation).toHaveBeenCalledWith('local_to_local');
  });

  test('renders an empty state when there are no relations', () => {
    render(<ProjectRelationsList relations={[]} onOpenRelation={jest.fn()} />);
    const list = screen.getByTestId('project-relations-list');
    expect(list).toBeInTheDocument();
    expect(list).toHaveTextContent(/No relations defined yet/i);
    expect(screen.queryByTestId(/^project-relations-row-/)).not.toBeInTheDocument();
  });

  test('handles a relation whose condition references no models', () => {
    const relations = [makeRelation('orphan', '')];
    render(<ProjectRelationsList relations={relations} onOpenRelation={jest.fn()} />);
    const row = screen.getByTestId('project-relations-row-orphan');
    expect(within(row).getByText(/no models referenced/i)).toBeInTheDocument();
  });

  describe('summarizeRelation', () => {
    test('extracts distinct models and defaults join type to inner', () => {
      const result = summarizeRelation(
        makeRelation('r', '${ref(a).x} = ${ref(b).y}', undefined)
      );
      expect(result.joinType).toBe('inner');
      expect(result.models).toEqual(['a', 'b']);
    });

    test('deduplicates repeated model refs', () => {
      const result = summarizeRelation(
        makeRelation('r', '${ref(a).x} = ${ref(a).y} AND ${ref(b).z} = ${ref(a).w}')
      );
      expect(result.models).toEqual(['a', 'b']);
    });
  });
});
