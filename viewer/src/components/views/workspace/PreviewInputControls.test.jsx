/**
 * PreviewInputControls tests (VIS-1003 / design §5 + §8.3).
 *
 * Pure presentational strip: one <Input> per resolved config, null when empty,
 * and an input-type chip whose colors/icon come from the shared
 * objectTypeConfigs palette (never hand-rolled).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import PreviewInputControls from './PreviewInputControls';
import { getTypeColors } from '../common/objectTypeConfigs';

jest.mock('../../items/Input', () => ({ input }) => (
  <div data-testid="input-component">Input: {input?.name}</div>
));

describe('PreviewInputControls', () => {
  it('renders nothing when there are no input configs', () => {
    render(<PreviewInputControls inputConfigs={[]} projectId="p1" />);
    expect(screen.queryByTestId('input-controls-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-input-type-chip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-component')).not.toBeInTheDocument();
  });

  it('renders nothing when inputConfigs is undefined', () => {
    render(<PreviewInputControls projectId="p1" />);
    expect(screen.queryByTestId('input-controls-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-component')).not.toBeInTheDocument();
  });

  it('renders one <Input> per resolved config', () => {
    render(
      <PreviewInputControls
        inputConfigs={[{ name: 'region' }, { name: 'quarter' }]}
        projectId="p1"
      />
    );
    const inputs = screen.getAllByTestId('input-component');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveTextContent('region');
    expect(inputs[1]).toHaveTextContent('quarter');
  });

  it('renders the input-controls-section strip when configs are present', () => {
    render(<PreviewInputControls inputConfigs={[{ name: 'region' }]} projectId="p1" />);
    expect(screen.getByTestId('input-controls-section')).toBeInTheDocument();
  });

  it('renders an input-type chip styled from objectTypeConfigs (not hand-rolled)', () => {
    render(<PreviewInputControls inputConfigs={[{ name: 'region' }]} projectId="p1" />);
    const chip = screen.getByTestId('preview-input-type-chip');
    expect(chip).toBeInTheDocument();

    // The chip's classes come from the shared palette's 'input' entry.
    const colors = getTypeColors('input');
    expect(chip).toHaveClass(colors.bg);
    expect(chip).toHaveClass(colors.text);
    expect(chip).toHaveClass(colors.border);
  });
});
