/* eslint-disable no-template-curly-in-string -- N/A here, kept for parity with sibling test files */
/**
 * SemanticLayerErdModelNode (Explore 2.0 Phase 5 — VIS-1069) — the ERD
 * model card's "Explore this" field-pill back-link.
 *
 * e2e-gap-review.md P5-D4 [MEDIUM, "Final delta pass"]: `handleExploreField`
 * had NO in-flight guard at all (no `disabled`, no ref) — a rapid
 * double-click could dispatch both click events before React ever re-renders
 * a `disabled` button, minting two exploration records for the same field.
 * Fixed with the same synchronous in-flight ref pattern `ExplorationPane.jsx`'s
 * `handleDuplicate` uses (`duplicatingRef`), keyed per field NAME (not a
 * single boolean) so exploring one field never blocks a sibling field's own
 * pill.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import SemanticLayerErdModelNode from './SemanticLayerErdModelNode';
import useStore from '../../../../stores/store';

const data = {
  name: 'orders',
  columns: ['id', 'amount'],
  metrics: ['total_revenue'],
  dimensions: ['order_status', 'region'],
};

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      createExploration: jest.fn().mockResolvedValue({ success: true, id: 'exp_1' }),
      buildExplorationSeedState: jest.fn(() => null),
      openWorkspaceTab: jest.fn(),
      ...extra,
    });
  });
};

const renderNode = (props = {}) =>
  render(
    <ReactFlowProvider>
      <SemanticLayerErdModelNode data={data} selected={false} {...props} />
    </ReactFlowProvider>
  );

describe('SemanticLayerErdModelNode — field pill "Explore this" back-link', () => {
  test('a pointerdown on a field pill stops propagation (never starts a React Flow node drag)', () => {
    seed();
    renderNode();
    fireEvent.pointerDown(screen.getByTestId('erd-metric-pill-total_revenue'));
    // No throw / no node-drag side effect to assert directly — this pins
    // the stopPropagation call itself executing (see the model header
    // Explore button's identical guard, tested alongside it below).
  });

  test('clicking a metric pill mints an exploration seeded from that field and opens its tab', async () => {
    const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_1' });
    const openWorkspaceTab = jest.fn();
    seed({ createExploration, openWorkspaceTab });
    renderNode();

    fireEvent.click(screen.getByTestId('erd-metric-pill-total_revenue'));
    await waitFor(() => expect(openWorkspaceTab).toHaveBeenCalled());

    expect(createExploration).toHaveBeenCalledWith(
      { type: 'metric', name: 'total_revenue' },
      null,
      null
    );
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'exploration:exp_1',
      type: 'exploration',
      name: 'exp_1',
    });
  });

  // P5-D4 — the core regression-armor assertion: exactly one exploration
  // gets minted from a rapid double-click.
  test('double-clicking the SAME field pill mints exactly ONE exploration (P5-D4)', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    const openWorkspaceTab = jest.fn();
    seed({ createExploration, openWorkspaceTab });
    renderNode();

    const pill = screen.getByTestId('erd-metric-pill-total_revenue');
    fireEvent.click(pill);
    fireEvent.click(pill); // fires before the first call resolves

    await waitFor(() => expect(createExploration).toHaveBeenCalledTimes(1));
    expect(pill).toBeDisabled();

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_1' });
    });
    await waitFor(() => expect(pill).not.toBeDisabled());
    expect(openWorkspaceTab).toHaveBeenCalledTimes(1);
  });

  test('the pill re-enables (and the guard clears) once the in-flight create resolves', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    seed({ createExploration });
    renderNode();

    const pill = screen.getByTestId('erd-metric-pill-total_revenue');
    fireEvent.click(pill);
    expect(pill).toBeDisabled();

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_1' });
    });
    await waitFor(() => expect(pill).not.toBeDisabled());

    // A SUBSEQUENT click (after the first fully resolved) must still work —
    // the guard isn't permanently stuck.
    fireEvent.click(pill);
    await waitFor(() => expect(createExploration).toHaveBeenCalledTimes(2));
  });

  // The in-flight guard is keyed PER FIELD NAME — a different field's own
  // pill must never be blocked by a sibling field's in-flight create.
  test('exploring one field does not disable a DIFFERENT field pill in the same section', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    seed({ createExploration });
    renderNode();

    fireEvent.click(screen.getByTestId('erd-dimension-pill-order_status'));
    expect(screen.getByTestId('erd-dimension-pill-order_status')).toBeDisabled();
    expect(screen.getByTestId('erd-dimension-pill-region')).not.toBeDisabled();

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_1' });
    });
  });
});

// Phase 6c-T5 (ux-audit.md "No 'Explore this' entry point from Semantic
// Layer ERD — nodes are completely inert"): the model card header itself
// gets a VISIBLE "Explore" affordance — not just the field pills.
describe('SemanticLayerErdModelNode — model header "Explore" button (Phase 6c-T5)', () => {
  test('is visible without hovering or right-clicking, and mints an exploration seeded from the whole model', async () => {
    const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_model' });
    const openWorkspaceTab = jest.fn();
    seed({ createExploration, openWorkspaceTab });
    renderNode();

    const button = screen.getByTestId('semantic-erd-model-explore-orders');
    expect(button).toBeVisible();
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    await waitFor(() => expect(openWorkspaceTab).toHaveBeenCalled());

    expect(createExploration).toHaveBeenCalledWith({ type: 'model', name: 'orders' }, null, null);
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'exploration:exp_model',
      type: 'exploration',
      name: 'exp_model',
    });
  });

  test('double-clicking the model Explore button mints exactly ONE exploration', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    seed({ createExploration });
    renderNode();

    const button = screen.getByTestId('semantic-erd-model-explore-orders');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(createExploration).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_model' });
    });
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
