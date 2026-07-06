/**
 * EditPanelBreadcrumb component tests (VIS-804 / Track G G-2).
 *
 * The breadcrumb band renders the selection's ancestry as clickable segments
 * and is the keyboard-nav surface for the selection. These tests exercise the
 * rendered segments for several selection depths, segment clicks (select the
 * ancestor), and the keydown handlers (↑/↓ siblings, ←/→ hierarchy, Enter
 * focuses the form, Esc deselects, ⌘↑/↓ reorder).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EditPanelBreadcrumb from './EditPanelBreadcrumb';

const ref = name => '${ref(' + name + ')}';

const ROWS = [
  {
    height: 'medium',
    items: [{ chart: ref('great_fib'), width: 2 }, { table: 'sales_table', width: 1 }],
  },
  {
    height: 'small',
    items: [{ width: 1, rows: [{ height: 'medium', items: [{ markdown: 'notes' }] }] }],
  },
];

const renderBreadcrumb = (props = {}) => {
  const onSelectKey = jest.fn();
  const onReorder = jest.fn();
  const onFocusForm = jest.fn();
  render(
    <EditPanelBreadcrumb
      outlineKey={props.outlineKey ?? 'dashboard'}
      dashboardName="my-dash"
      rows={ROWS}
      onSelectKey={onSelectKey}
      onReorder={onReorder}
      onFocusForm={onFocusForm}
    />
  );
  return { onSelectKey, onReorder, onFocusForm };
};

describe('EditPanelBreadcrumb rendering', () => {
  test('dashboard selection → single mulberry segment', () => {
    renderBreadcrumb({ outlineKey: 'dashboard' });
    const seg = screen.getByTestId('edit-breadcrumb-segment-dashboard');
    expect(seg).toHaveTextContent('my-dash');
    expect(seg).toHaveAttribute('data-current', 'true');
    expect(screen.queryByTestId('edit-breadcrumb-segment-row.0')).not.toBeInTheDocument();
  });

  test('row selection → two segments', () => {
    renderBreadcrumb({ outlineKey: 'row.0' });
    expect(screen.getByTestId('edit-breadcrumb-segment-dashboard')).toHaveAttribute(
      'data-current',
      'false'
    );
    expect(screen.getByTestId('edit-breadcrumb-segment-row.0')).toHaveTextContent('Row 1');
  });

  test('nested item selection → full chain with leaf name', () => {
    const key = 'row.1.item.0.row.0.item.0';
    renderBreadcrumb({ outlineKey: key });
    expect(screen.getByTestId('edit-breadcrumb-segment-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('edit-breadcrumb-segment-row.1')).toBeInTheDocument();
    expect(screen.getByTestId('edit-breadcrumb-segment-row.1.item.0')).toBeInTheDocument();
    expect(screen.getByTestId(`edit-breadcrumb-segment-${key}`)).toHaveTextContent('notes');
  });

  test('renders a discoverable keyboard-nav hint (VIS-985/VIS-1000)', () => {
    renderBreadcrumb({ outlineKey: 'row.0' });
    const hint = screen.getByTestId('edit-breadcrumb-kbd-hint');
    // The shortcut legend is discoverable via native title AND an SR-only span.
    expect(hint).toHaveAttribute('title', expect.stringMatching(/reorder/i));
    expect(hint).toHaveTextContent(/↑↓ move between siblings/);
  });

  test('a11y position announced for screen readers', () => {
    renderBreadcrumb({ outlineKey: 'row.0.item.0' });
    expect(screen.getByTestId('edit-breadcrumb-position')).toHaveTextContent(
      'my-dash / Row 1 / great_fib'
    );
  });
});

describe('EditPanelBreadcrumb interactions', () => {
  test('clicking an ancestor segment selects it', () => {
    const { onSelectKey } = renderBreadcrumb({ outlineKey: 'row.0.item.0' });
    fireEvent.click(screen.getByTestId('edit-breadcrumb-segment-row.0'));
    expect(onSelectKey).toHaveBeenCalledWith('row.0');
  });

  test('↓ steps to the next sibling', () => {
    const { onSelectKey } = renderBreadcrumb({ outlineKey: 'row.0' });
    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), { key: 'ArrowDown' });
    expect(onSelectKey).toHaveBeenCalledWith('row.1');
  });

  test('↑ wraps among siblings', () => {
    const { onSelectKey } = renderBreadcrumb({ outlineKey: 'row.0' });
    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), { key: 'ArrowUp' });
    expect(onSelectKey).toHaveBeenCalledWith('row.1');
  });

  test('← steps up the hierarchy', () => {
    const { onSelectKey } = renderBreadcrumb({ outlineKey: 'row.0.item.0' });
    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), { key: 'ArrowLeft' });
    expect(onSelectKey).toHaveBeenCalledWith('row.0');
  });

  test('→ steps down into the first child', () => {
    const { onSelectKey } = renderBreadcrumb({ outlineKey: 'row.0' });
    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), { key: 'ArrowRight' });
    expect(onSelectKey).toHaveBeenCalledWith('row.0.item.0');
  });

  test('Esc deselects to the dashboard root', () => {
    const { onSelectKey } = renderBreadcrumb({ outlineKey: 'row.0.item.1' });
    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), { key: 'Escape' });
    expect(onSelectKey).toHaveBeenCalledWith('dashboard');
  });

  test('Enter focuses the form', () => {
    const { onFocusForm } = renderBreadcrumb({ outlineKey: 'row.0' });
    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), { key: 'Enter' });
    expect(onFocusForm).toHaveBeenCalled();
  });

  test('⌘↓ reorders the focused node', () => {
    const { onReorder } = renderBreadcrumb({ outlineKey: 'row.0' });
    fireEvent.keyDown(screen.getByTestId('edit-breadcrumb'), { key: 'ArrowDown', metaKey: true });
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({ axis: 'row', fromIndex: 0, toIndex: 1 })
    );
  });

  test('empty band when no segments resolve', () => {
    render(
      <EditPanelBreadcrumb
        outlineKey="dashboard"
        dashboardName={null}
        rows={null}
        onSelectKey={jest.fn()}
      />
    );
    // dashboardName null still yields a 'Dashboard' fallback segment, so the
    // band is present (never collapses) — verify it renders the root segment.
    expect(screen.getByTestId('edit-breadcrumb-segment-dashboard')).toHaveTextContent('Dashboard');
  });
});
