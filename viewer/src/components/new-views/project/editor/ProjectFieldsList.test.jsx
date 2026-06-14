import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProjectFieldsList, { buildFieldRows } from './ProjectFieldsList';

const makeField = (name, expression) => ({
  name,
  status: 'PUBLISHED',
  config: { name, expression },
});

const METRICS = [makeField('revenue', 'sum(amount)'), makeField('order_count', 'count(*)')];
const DIMENSIONS = [makeField('region', 'address_region'), makeField('cohort', 'date_trunc(...)')];

describe('ProjectFieldsList', () => {
  test('renders a row per metric and dimension', () => {
    render(
      <ProjectFieldsList metrics={METRICS} dimensions={DIMENSIONS} onOpenField={jest.fn()} />
    );
    expect(screen.getByTestId('project-fields-list')).toBeInTheDocument();
    expect(screen.getByTestId('project-fields-row-revenue')).toBeInTheDocument();
    expect(screen.getByTestId('project-fields-row-order_count')).toBeInTheDocument();
    expect(screen.getByTestId('project-fields-row-region')).toBeInTheDocument();
    expect(screen.getByTestId('project-fields-row-cohort')).toBeInTheDocument();
  });

  test('rows show the expression and a type chip (metric / dimension)', () => {
    render(
      <ProjectFieldsList metrics={METRICS} dimensions={DIMENSIONS} onOpenField={jest.fn()} />
    );
    const metricRow = screen.getByTestId('project-fields-row-revenue');
    expect(metricRow).toHaveAttribute('data-field-type', 'metric');
    expect(within(metricRow).getByTestId('project-fields-row-revenue-chip')).toHaveTextContent(
      'metric'
    );
    expect(metricRow).toHaveTextContent('sum(amount)');

    const dimRow = screen.getByTestId('project-fields-row-region');
    expect(dimRow).toHaveAttribute('data-field-type', 'dimension');
    expect(within(dimRow).getByTestId('project-fields-row-region-chip')).toHaveTextContent(
      'dimension'
    );
    expect(dimRow).toHaveTextContent('address_region');
  });

  test('metrics and dimensions are merged and sorted alphabetically', () => {
    render(
      <ProjectFieldsList metrics={METRICS} dimensions={DIMENSIONS} onOpenField={jest.fn()} />
    );
    const rows = screen.getAllByTestId(/^project-fields-row-[^-]+$/);
    const names = rows.map(r => r.getAttribute('data-testid').replace('project-fields-row-', ''));
    expect(names).toEqual(['cohort', 'order_count', 'region', 'revenue']);
  });

  test('clicking a metric row deep-links with type "metric" and the name', () => {
    const onOpenField = jest.fn();
    render(<ProjectFieldsList metrics={METRICS} dimensions={DIMENSIONS} onOpenField={onOpenField} />);
    fireEvent.click(screen.getByTestId('project-fields-row-revenue'));
    expect(onOpenField).toHaveBeenCalledWith('metric', 'revenue');
  });

  test('clicking a dimension row deep-links with type "dimension" and the name', () => {
    const onOpenField = jest.fn();
    render(<ProjectFieldsList metrics={METRICS} dimensions={DIMENSIONS} onOpenField={onOpenField} />);
    fireEvent.click(screen.getByTestId('project-fields-row-region'));
    expect(onOpenField).toHaveBeenCalledWith('dimension', 'region');
  });

  test('renders an empty state when there are no fields', () => {
    render(<ProjectFieldsList metrics={[]} dimensions={[]} onOpenField={jest.fn()} />);
    const list = screen.getByTestId('project-fields-list');
    expect(list).toHaveTextContent(/No semantic fields defined yet/i);
    expect(screen.queryByTestId(/^project-fields-row-/)).not.toBeInTheDocument();
  });

  describe('buildFieldRows', () => {
    test('tags each row with its field type and sorts by name', () => {
      const rows = buildFieldRows(
        [makeField('zeta', 'x')],
        [makeField('alpha', 'y')]
      );
      expect(rows.map(r => r.obj.name)).toEqual(['alpha', 'zeta']);
      expect(rows.find(r => r.obj.name === 'alpha').fieldType).toBe('dimension');
      expect(rows.find(r => r.obj.name === 'zeta').fieldType).toBe('metric');
    });

    test('tolerates undefined collections', () => {
      expect(buildFieldRows(undefined, undefined)).toEqual([]);
    });
  });
});
