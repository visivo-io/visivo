import React from 'react';
import { render, screen } from '@testing-library/react';
import FeatureCard from './FeatureCard';

test('renders all feature cards with correct titles and descriptions', () => {
  render(<FeatureCard />);

  const titles = [
    'Open Source BI-As-Code',
    'Leverage Insights Faster',
    'Data Centric Collaboration',
  ];

  titles.forEach(title => {
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  const descriptions = [
    "We're committed to OSS. BI-as-code made easy. Extend your lineage into BI.",
    "10x your data team's productivity. Fast UI and zero noise for stakeholders.",
    'Unlock data-centric collaboration across your organization.',
  ];

  descriptions.forEach(description => {
    expect(screen.getByText(description)).toBeInTheDocument();
  });

  // Ensure 3 feature cards rendered
  const cards = screen.getAllByRole('heading', { level: 4 });
  expect(cards).toHaveLength(3);
});
