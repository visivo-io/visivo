import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SeedsEditor, { sourceTypeSupportsSeeds, SEEDLESS_SOURCE_TYPES } from './SeedsEditor';

/** Wrapper that owns the seeds state, so edits round-trip like they do in the form. */
const Harness = ({ initial = [], onChangeSpy }) => {
  const [seeds, setSeeds] = useState(initial);
  return (
    <SeedsEditor
      seeds={seeds}
      onChange={next => {
        onChangeSpy?.(next);
        setSeeds(next);
      }}
    />
  );
};

describe('sourceTypeSupportsSeeds', () => {
  test('database sources support seeds', () => {
    ['duckdb', 'sqlite', 'postgresql', 'mysql', 'snowflake', 'bigquery', 'clickhouse'].forEach(
      type => expect(sourceTypeSupportsSeeds(type)).toBe(true)
    );
  });

  test('file-backed sources do not — they build a throwaway in-memory connection', () => {
    // Mirrors the backend: `seeds` lives on ServerSource, and csv/xls sources
    // inherit only BaseDuckdbSource, so the API rejects the key outright.
    expect(SEEDLESS_SOURCE_TYPES).toEqual(['csv', 'xls']);
    SEEDLESS_SOURCE_TYPES.forEach(type => expect(sourceTypeSupportsSeeds(type)).toBe(false));
  });

  test('no type selected yet supports nothing', () => {
    expect(sourceTypeSupportsSeeds('')).toBe(false);
    expect(sourceTypeSupportsSeeds(undefined)).toBe(false);
  });
});

describe('SeedsEditor', () => {
  test('renders an empty state when there are no seeds', () => {
    render(<Harness />);
    expect(screen.getByText('No seeds configured.')).toBeInTheDocument();
  });

  test('adding a seed starts it with one blank arg row', () => {
    const onChangeSpy = jest.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);

    fireEvent.click(screen.getByText('Add Seed'));

    expect(onChangeSpy).toHaveBeenCalledWith([{ table_name: '', args: [''] }]);
    expect(screen.getByLabelText('Seed 1 table name')).toBeInTheDocument();
    expect(screen.getByLabelText('Seed 1 argument 1')).toBeInTheDocument();
  });

  test('editing the table name and args updates the seed', () => {
    const onChangeSpy = jest.fn();
    render(<Harness initial={[{ table_name: '', args: [''] }]} onChangeSpy={onChangeSpy} />);

    fireEvent.change(screen.getByLabelText('Seed 1 table name'), {
      target: { value: 'raw_orders' },
    });
    fireEvent.change(screen.getByLabelText('Seed 1 argument 1'), { target: { value: 'cat' } });

    expect(onChangeSpy).toHaveBeenLastCalledWith([{ table_name: 'raw_orders', args: ['cat'] }]);
  });

  test('args can be added and removed within a seed', () => {
    const onChangeSpy = jest.fn();
    render(
      <Harness initial={[{ table_name: 't', args: ['cat'] }]} onChangeSpy={onChangeSpy} />
    );

    fireEvent.click(screen.getByText('Add'));
    expect(onChangeSpy).toHaveBeenLastCalledWith([{ table_name: 't', args: ['cat', ''] }]);

    fireEvent.click(screen.getByLabelText('Remove argument 2 from seed 1'));
    expect(onChangeSpy).toHaveBeenLastCalledWith([{ table_name: 't', args: ['cat'] }]);
  });

  test('the only arg row has no remove button', () => {
    render(<Harness initial={[{ table_name: 't', args: ['cat'] }]} />);
    expect(screen.queryByLabelText('Remove argument 1 from seed 1')).not.toBeInTheDocument();
  });

  test('allow_empty toggles', () => {
    const onChangeSpy = jest.fn();
    render(
      <Harness initial={[{ table_name: 't', args: ['cat'] }]} onChangeSpy={onChangeSpy} />
    );

    fireEvent.click(screen.getByLabelText('Allow empty output'));

    expect(onChangeSpy).toHaveBeenLastCalledWith([
      { table_name: 't', args: ['cat'], allow_empty: true },
    ]);
  });

  test('existing_table defaults to skip and updates on select', () => {
    const onChangeSpy = jest.fn();
    render(
      <Harness initial={[{ table_name: 't', args: ['cat'] }]} onChangeSpy={onChangeSpy} />
    );

    // Defaults to "skip" (matching the model default) when unset.
    expect(screen.getByLabelText('When table exists')).toHaveValue('skip');

    fireEvent.change(screen.getByLabelText('When table exists'), {
      target: { value: 'append' },
    });

    expect(onChangeSpy).toHaveBeenLastCalledWith([
      { table_name: 't', args: ['cat'], existing_table: 'append' },
    ]);
  });

  test('seeds are independent — editing one leaves the other alone', () => {
    const onChangeSpy = jest.fn();
    render(
      <Harness
        initial={[
          { table_name: 'first', args: ['cat', 'a.csv'] },
          { table_name: 'second', args: ['cat', 'b.csv'] },
        ]}
        onChangeSpy={onChangeSpy}
      />
    );

    fireEvent.change(screen.getByLabelText('Seed 2 table name'), {
      target: { value: 'renamed' },
    });

    expect(onChangeSpy).toHaveBeenLastCalledWith([
      { table_name: 'first', args: ['cat', 'a.csv'] },
      { table_name: 'renamed', args: ['cat', 'b.csv'] },
    ]);
  });

  test('removing a seed drops just that one', () => {
    const onChangeSpy = jest.fn();
    render(
      <Harness
        initial={[
          { table_name: 'first', args: ['cat'] },
          { table_name: 'second', args: ['cat'] },
        ]}
        onChangeSpy={onChangeSpy}
      />
    );

    fireEvent.click(screen.getByLabelText('Remove seed 1'));

    expect(onChangeSpy).toHaveBeenLastCalledWith([{ table_name: 'second', args: ['cat'] }]);
  });
});
