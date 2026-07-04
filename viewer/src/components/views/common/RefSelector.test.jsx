/**
 * Tests for RefSelector — the dropdown for selecting object references.
 * Pins the ref() round-trip: incoming values like ${ref(name)} are parsed to
 * bare names for display, and selections are serialized back to ref format.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import selectEvent from 'react-select-event';
import RefSelector from './RefSelector';
import useStore from '../../../stores/store';

// Build '${ref(name)}' without tripping no-template-curly-in-string.
const R = name => '${ref(' + name + ')}';

describe('RefSelector', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({
        sources: [{ name: 'pg' }, { name: 'duck' }],
        models: [{ name: 'orders' }],
        csvScriptModels: [{ name: 'csv_model' }],
        localMergeModels: [{ name: 'merge_model' }],
      });
    });
  });

  it('renders the label with a required asterisk', () => {
    render(
      <RefSelector value={null} onChange={jest.fn()} objectType="source" label="Source" required />
    );
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('displays the parsed name for a context-ref value', () => {
    render(
      <RefSelector value={R('pg')} onChange={jest.fn()} objectType="source" label="Source" />
    );
    expect(screen.getByTestId('ref-selector-source')).toHaveTextContent('pg');
  });

  it('displays the parsed name for a bare ref(name) value', () => {
    render(
      <RefSelector value="ref(duck)" onChange={jest.fn()} objectType="source" label="Source" />
    );
    expect(screen.getByTestId('ref-selector-source')).toHaveTextContent('duck');
  });

  it('serializes a selection back to context-ref format', async () => {
    const onChange = jest.fn();
    render(<RefSelector value={null} onChange={onChange} objectType="source" label="Source" />);

    // The menu is portaled to document.body, so point react-select-event there.
    await selectEvent.select(screen.getByLabelText('Source'), 'duck', {
      container: document.body,
    });
    expect(onChange).toHaveBeenCalledWith(R('duck'));
  });

  it('uses a type-derived placeholder when none is given', () => {
    render(<RefSelector value={null} onChange={jest.fn()} objectType="source" />);
    expect(screen.getByText('Select a source...')).toBeInTheDocument();
  });

  it('uses a plural placeholder in multiple mode', () => {
    render(<RefSelector value={null} onChange={jest.fn()} objectType="source" multiple />);
    expect(screen.getByText('Select sources...')).toBeInTheDocument();
  });

  it('offers sql, csv-script, and local-merge models for objectType="model"', async () => {
    render(<RefSelector value={null} onChange={jest.fn()} objectType="model" label="Model" />);

    await selectEvent.openMenu(screen.getByLabelText('Model'));
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('csv_model')).toBeInTheDocument();
    expect(screen.getByText('merge_model')).toBeInTheDocument();
  });

  it('has no options for an unknown objectType', async () => {
    render(
      <RefSelector value={null} onChange={jest.fn()} objectType="mystery" label="Mystery" />
    );

    await selectEvent.openMenu(screen.getByLabelText('Mystery'));
    expect(screen.getByText('No options')).toBeInTheDocument();
  });

  it('shows helperText only while nothing is selected (single mode)', () => {
    const { rerender } = render(
      <RefSelector
        value={null}
        onChange={jest.fn()}
        objectType="source"
        label="Source"
        helperText="Pick your warehouse"
      />
    );
    expect(screen.getByText('Pick your warehouse')).toBeInTheDocument();

    rerender(
      <RefSelector
        value={R('pg')}
        onChange={jest.fn()}
        objectType="source"
        label="Source"
        helperText="Pick your warehouse"
      />
    );
    expect(screen.queryByText('Pick your warehouse')).not.toBeInTheDocument();
  });

  it('keeps helperText visible in multiple mode even with selections', () => {
    render(
      <RefSelector
        value={[R('pg')]}
        onChange={jest.fn()}
        objectType="source"
        label="Sources"
        helperText="Pick warehouses"
        multiple
      />
    );
    expect(screen.getByText('Pick warehouses')).toBeInTheDocument();
  });

  describe('multiple mode', () => {
    it('parses an array of refs into individual selections', () => {
      render(
        <RefSelector
          value={[R('pg'), R('duck')]}
          onChange={jest.fn()}
          objectType="source"
          label="Sources"
          multiple
        />
      );
      const container = screen.getByTestId('ref-selector-source');
      expect(container).toHaveTextContent('pg');
      expect(container).toHaveTextContent('duck');
    });

    it('adds a selection and emits the full array of ref expressions', async () => {
      const onChange = jest.fn();
      render(
        <RefSelector
          value={[R('pg')]}
          onChange={onChange}
          objectType="source"
          label="Sources"
          multiple
        />
      );

      await selectEvent.select(screen.getByLabelText('Sources'), 'duck', {
        container: document.body,
      });
      expect(onChange).toHaveBeenCalledWith([R('pg'), R('duck')]);
    });

    it('emits null when the last selection is removed', () => {
      const onChange = jest.fn();
      render(
        <RefSelector
          value={[R('pg')]}
          onChange={onChange}
          objectType="source"
          label="Sources"
          multiple
        />
      );

      // react-select's multi-value remove renders role="button" with a
      // "Remove …" aria-label.
      fireEvent.click(screen.getByRole('button', { name: /remove/i }));
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });
});
