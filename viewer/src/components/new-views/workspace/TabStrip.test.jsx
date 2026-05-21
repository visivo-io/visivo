/**
 * TabStrip behaviour (VIS-775 / Track B B2).
 *
 * Pure-presentational tests against the strip. The smart tab state
 * (workspace store hydration, URL sync) is covered in Workspace.test.jsx.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TabStrip from './TabStrip';

const sampleTabs = [
  { id: 'project:analytics-platform', type: 'project', name: 'analytics-platform' },
  {
    id: 'dashboard:simple-dashboard',
    type: 'dashboard',
    name: 'simple-dashboard',
    dirty: true,
  },
  { id: 'chart:revenue_chart', type: 'chart', name: 'revenue_chart' },
];

describe('TabStrip', () => {
  test('renders nothing when there are no tabs', () => {
    const { container } = render(<TabStrip tabs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders one tab per descriptor with the right active state', () => {
    render(
      <TabStrip tabs={sampleTabs} activeId="dashboard:simple-dashboard" />
    );
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toHaveAttribute('data-active', 'false');
    expect(
      screen.getByTestId('workspace-tab-dashboard:simple-dashboard')
    ).toHaveAttribute('data-active', 'true');
    expect(
      screen.getByTestId('workspace-tab-chart:revenue_chart')
    ).toHaveAttribute('data-active', 'false');
  });

  test('renders the dirty dot on tabs marked dirty', () => {
    render(<TabStrip tabs={sampleTabs} activeId={null} />);
    expect(
      screen.getByTestId('workspace-tab-dirty-dashboard:simple-dashboard')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-tab-dirty-project:analytics-platform')
    ).not.toBeInTheDocument();
  });

  test('clicking the tab body calls onSelect with the tab id', () => {
    const onSelect = jest.fn();
    render(
      <TabStrip tabs={sampleTabs} activeId={null} onSelect={onSelect} />
    );
    fireEvent.click(
      screen.getByTestId('workspace-tab-select-chart:revenue_chart')
    );
    expect(onSelect).toHaveBeenCalledWith('chart:revenue_chart');
  });

  test('clicking the close button calls onClose without bubbling to select', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    render(
      <TabStrip
        tabs={sampleTabs}
        activeId={null}
        onSelect={onSelect}
        onClose={onClose}
      />
    );
    fireEvent.click(
      screen.getByTestId('workspace-tab-close-dashboard:simple-dashboard')
    );
    expect(onClose).toHaveBeenCalledWith('dashboard:simple-dashboard');
    // stopPropagation in the close handler prevents the underlying select fire.
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('clicking the + button calls onNewTab', () => {
    const onNewTab = jest.fn();
    render(<TabStrip tabs={sampleTabs} activeId={null} onNewTab={onNewTab} />);
    fireEvent.click(screen.getByTestId('workspace-tab-new'));
    expect(onNewTab).toHaveBeenCalled();
  });
});
