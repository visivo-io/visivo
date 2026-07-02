/**
 * Tests for EmbeddedTypesIndicator: detection of embedded child types on
 * models/charts/tables, and the stacked-icon indicator rendering.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { getEmbeddedTypes, EmbeddedTypesIndicator } from './EmbeddedTypesIndicator';

describe('getEmbeddedTypes', () => {
  it('detects an embedded source object on a model', () => {
    const obj = { config: { source: { name: 'pg', type: 'postgresql' } } };
    expect(getEmbeddedTypes(obj, 'model')).toEqual(['source']);
  });

  it('does not report a source that is only a ref string', () => {
    const obj = { config: { source: 'ref(pg)' } };
    expect(getEmbeddedTypes(obj, 'model')).toEqual([]);
  });

  it('detects inline dimensions and metrics on a model', () => {
    const obj = {
      config: {
        dimensions: [{ name: 'd1' }],
        metrics: [{ name: 'm1' }],
      },
    };
    expect(getEmbeddedTypes(obj, 'model')).toEqual(['dimension', 'metric']);
  });

  it('reports source, dimension, and metric together in stable order', () => {
    const obj = {
      config: {
        source: { name: 'pg' },
        dimensions: [{ name: 'd1' }],
        metrics: [{ name: 'm1' }],
      },
    };
    expect(getEmbeddedTypes(obj, 'model')).toEqual(['source', 'dimension', 'metric']);
  });

  it('returns [] for a model with no config', () => {
    expect(getEmbeddedTypes({}, 'model')).toEqual([]);
    expect(getEmbeddedTypes({ config: {} }, 'model')).toEqual([]);
  });

  it('detects embedded insight objects on charts and tables', () => {
    const obj = { config: { insights: [{ name: 'inline_insight' }] } };
    expect(getEmbeddedTypes(obj, 'chart')).toEqual(['insight']);
    expect(getEmbeddedTypes(obj, 'table')).toEqual(['insight']);
  });

  it('ignores insights that are all ref strings', () => {
    const obj = { config: { insights: ['ref(a)', 'ref(b)'] } };
    expect(getEmbeddedTypes(obj, 'chart')).toEqual([]);
  });

  it('detects a mix of ref strings and inline insight objects', () => {
    const obj = { config: { insights: ['ref(a)', { name: 'inline' }] } };
    expect(getEmbeddedTypes(obj, 'chart')).toEqual(['insight']);
  });

  it('returns [] for object types without embedding rules', () => {
    const obj = { config: { source: { name: 'pg' }, insights: [{}] } };
    expect(getEmbeddedTypes(obj, 'dashboard')).toEqual([]);
    expect(getEmbeddedTypes(obj, 'source')).toEqual([]);
  });
});

describe('EmbeddedTypesIndicator', () => {
  it('renders nothing for empty or missing types', () => {
    const { container: empty } = render(<EmbeddedTypesIndicator types={[]} />);
    expect(empty).toBeEmptyDOMElement();

    const { container: missing } = render(<EmbeddedTypesIndicator types={null} />);
    expect(missing).toBeEmptyDOMElement();
  });

  it('renders nothing when no type has a known icon', () => {
    const { container } = render(<EmbeddedTypesIndicator types={['not-a-real-type']} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single icon with a descriptive title for one type', () => {
    render(<EmbeddedTypesIndicator types={['source']} />);
    const badge = screen.getByTitle('Contains embedded source');
    // MUI icons carry a `<Name>Icon` data-testid.
    expect(within(badge).getAllByTestId(/Icon$/)).toHaveLength(1);
  });

  it('renders stacked icons listing every type for multiple types', () => {
    render(<EmbeddedTypesIndicator types={['source', 'metric']} />);
    const stack = screen.getByTitle('Contains embedded: source, metric');
    expect(within(stack).getAllByTestId(/Icon$/)).toHaveLength(2);
  });

  it('drops unknown types but keeps known ones', () => {
    render(<EmbeddedTypesIndicator types={['bogus', 'dimension', 'metric']} />);
    // Title reflects the full list; only resolvable icons render.
    const stack = screen.getByTitle('Contains embedded: bogus, dimension, metric');
    expect(within(stack).getAllByTestId(/Icon$/)).toHaveLength(2);
  });
});
