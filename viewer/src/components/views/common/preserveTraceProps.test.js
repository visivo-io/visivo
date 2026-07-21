import { preserveTraceProps } from './preserveTraceProps';
import barSchema from '../../../schemas/bar.schema.json';
import scatterSchema from '../../../schemas/scatter.schema.json';

describe('preserveTraceProps (VIS-1020 §2 type-switch prop preservation)', () => {
  // Sanity-check the real schemas we rely on so the acceptance assertions below
  // mean what we think they mean.
  it('uses real schemas where bar HAS x/y but lacks mode/line, and scatter HAS all four', () => {
    expect(barSchema.properties).toHaveProperty('x');
    expect(barSchema.properties).toHaveProperty('y');
    expect(barSchema.properties).not.toHaveProperty('mode');
    expect(barSchema.properties).not.toHaveProperty('line');

    expect(scatterSchema.properties).toHaveProperty('x');
    expect(scatterSchema.properties).toHaveProperty('y');
    expect(scatterSchema.properties).toHaveProperty('mode');
    expect(scatterSchema.properties).toHaveProperty('line');
  });

  const scatterProps = {
    type: 'scatter',
    x: [1],
    y: [2],
    mode: 'lines',
    line: { dash: 'dot' },
  };

  it('drops props the new type does not support and keeps compatible ones (scatter → bar)', () => {
    const { props } = preserveTraceProps({
      oldProps: scatterProps,
      oldType: 'scatter',
      newType: 'bar',
      newSchema: barSchema,
      typePropsCache: {},
    });

    expect(props.type).toBe('bar');
    expect(props.x).toEqual([1]);
    expect(props.y).toEqual([2]);
    expect(props).not.toHaveProperty('mode');
    expect(props).not.toHaveProperty('line');
  });

  it('stashes the full old props (minus type) under the old type key', () => {
    const { typePropsCache } = preserveTraceProps({
      oldProps: scatterProps,
      oldType: 'scatter',
      newType: 'bar',
      newSchema: barSchema,
      typePropsCache: {},
    });

    expect(typePropsCache.scatter).toEqual({
      x: [1],
      y: [2],
      mode: 'lines',
      line: { dash: 'dot' },
    });
    // type itself is never stashed inside the cached props
    expect(typePropsCache.scatter).not.toHaveProperty('type');
  });

  it('restores mode & line from cache when switching back (scatter → bar → scatter)', () => {
    // First switch: scatter → bar
    const afterBar = preserveTraceProps({
      oldProps: scatterProps,
      oldType: 'scatter',
      newType: 'bar',
      newSchema: barSchema,
      typePropsCache: {},
    });

    expect(afterBar.props).toEqual({ type: 'bar', x: [1], y: [2] });

    // Second switch: bar → scatter (user switched back)
    const afterScatter = preserveTraceProps({
      oldProps: afterBar.props,
      oldType: 'bar',
      newType: 'scatter',
      newSchema: scatterSchema,
      typePropsCache: afterBar.typePropsCache,
    });

    expect(afterScatter.props.type).toBe('scatter');
    expect(afterScatter.props.x).toEqual([1]);
    expect(afterScatter.props.y).toEqual([2]);
    // mode & line come back from the cached scatter snapshot
    expect(afterScatter.props.mode).toBe('lines');
    expect(afterScatter.props.line).toEqual({ dash: 'dot' });
  });

  it('records bar props under the bar key on the second switch', () => {
    const afterBar = preserveTraceProps({
      oldProps: scatterProps,
      oldType: 'scatter',
      newType: 'bar',
      newSchema: barSchema,
      typePropsCache: {},
    });
    const afterScatter = preserveTraceProps({
      oldProps: afterBar.props,
      oldType: 'bar',
      newType: 'scatter',
      newSchema: scatterSchema,
      typePropsCache: afterBar.typePropsCache,
    });

    expect(afterScatter.typePropsCache.bar).toEqual({ x: [1], y: [2] });
    expect(afterScatter.typePropsCache.scatter).toEqual({
      x: [1],
      y: [2],
      mode: 'lines',
      line: { dash: 'dot' },
    });
  });

  it('carry-forward edits win over the restored snapshot on switch-back', () => {
    // scatter → bar, then the user edits x while on bar
    const afterBar = preserveTraceProps({
      oldProps: scatterProps,
      oldType: 'scatter',
      newType: 'bar',
      newSchema: barSchema,
      typePropsCache: {},
    });
    const editedBarProps = { ...afterBar.props, x: [99] };

    // bar → scatter: x should reflect the edit, not the stale cached value
    const afterScatter = preserveTraceProps({
      oldProps: editedBarProps,
      oldType: 'bar',
      newType: 'scatter',
      newSchema: scatterSchema,
      typePropsCache: afterBar.typePropsCache,
    });

    expect(afterScatter.props.x).toEqual([99]);
    // line/mode (not editable on bar) still restored from cache
    expect(afterScatter.props.mode).toBe('lines');
    expect(afterScatter.props.line).toEqual({ dash: 'dot' });
  });

  it('always sets props.type to the new type', () => {
    const { props } = preserveTraceProps({
      oldProps: { type: 'scatter', x: [1] },
      oldType: 'scatter',
      newType: 'bar',
      newSchema: barSchema,
      typePropsCache: {},
    });
    expect(props.type).toBe('bar');
  });

  it('is pure: does not mutate the incoming oldProps or typePropsCache', () => {
    const cache = {};
    const props = { ...scatterProps };
    preserveTraceProps({
      oldProps: props,
      oldType: 'scatter',
      newType: 'bar',
      newSchema: barSchema,
      typePropsCache: cache,
    });
    expect(props).toEqual(scatterProps);
    expect(cache).toEqual({});
  });

  it('tolerates a completely missing newSchema (undefined) without throwing', () => {
    const { props } = preserveTraceProps({
      oldProps: scatterProps,
      oldType: 'scatter',
      newType: 'mystery',
      newSchema: undefined,
      typePropsCache: {},
    });
    // No properties key to validate against -> everything drops.
    expect(props).toEqual({ type: 'mystery' });
  });

  it('tolerates a newSchema with no `properties` key at all', () => {
    const { props } = preserveTraceProps({
      oldProps: scatterProps,
      oldType: 'scatter',
      newType: 'mystery',
      newSchema: { $defs: {} },
      typePropsCache: {},
    });
    expect(props).toEqual({ type: 'mystery' });
  });

  it('tolerates missing/empty inputs without throwing', () => {
    const { props, typePropsCache } = preserveTraceProps({
      oldProps: undefined,
      oldType: 'scatter',
      newType: 'bar',
      newSchema: barSchema,
      typePropsCache: undefined,
    });
    expect(props).toEqual({ type: 'bar' });
    expect(typePropsCache.scatter).toEqual({});
  });

  it('drops every old prop when the new schema has no overlapping properties', () => {
    const emptySchema = { properties: {} };
    const { props } = preserveTraceProps({
      oldProps: scatterProps,
      oldType: 'scatter',
      newType: 'mystery',
      newSchema: emptySchema,
      typePropsCache: {},
    });
    expect(props).toEqual({ type: 'mystery' });
  });

  // T4 (pills-buildrail #2): the `dropped` list is what lets the caller warn
  // the user about a silent type-switch data loss instead of eating it.
  describe('the `dropped` list (T4 / pills-buildrail #2)', () => {
    it('names exactly the top-level props that had a value under the OLD type but are not valid on a FRESH new type', () => {
      const { dropped } = preserveTraceProps({
        oldProps: scatterProps,
        oldType: 'scatter',
        newType: 'bar',
        newSchema: barSchema,
        typePropsCache: {},
      });
      // scatterProps has x, y, mode, line; bar only allows x/y.
      expect(dropped.sort()).toEqual(['line', 'mode']);
    });

    it('is empty when every old prop is valid on the new type', () => {
      const { dropped } = preserveTraceProps({
        oldProps: { type: 'bar', x: [1], y: [2] },
        oldType: 'bar',
        newType: 'scatter',
        newSchema: scatterSchema,
        typePropsCache: {},
      });
      expect(dropped).toEqual([]);
    });

    it('is empty when nothing was configured on the old type', () => {
      const { dropped } = preserveTraceProps({
        oldProps: { type: 'scatter' },
        oldType: 'scatter',
        newType: 'bar',
        newSchema: barSchema,
        typePropsCache: {},
      });
      expect(dropped).toEqual([]);
    });

    // A prior visit to `newType` restores its exact snapshot, so anything not
    // carried forward this time is already accounted for by that restoration
    // — warning again would be a false alarm about data that isn't actually lost.
    it('stays empty on a REVISIT to a previously-configured type, even though some props do not carry forward', () => {
      // First visit to bar stashes scatter's mode/line and drops them from view.
      const afterBar = preserveTraceProps({
        oldProps: scatterProps,
        oldType: 'scatter',
        newType: 'bar',
        newSchema: barSchema,
        typePropsCache: {},
      });
      // Switch back to scatter (mode/line restored from cache), then to bar
      // again — bar was already visited, so this is a "revisit".
      const afterScatterAgain = preserveTraceProps({
        oldProps: { ...afterBar.props, mode: 'markers' },
        oldType: 'bar',
        newType: 'scatter',
        newSchema: scatterSchema,
        typePropsCache: afterBar.typePropsCache,
      });
      const revisitBar = preserveTraceProps({
        oldProps: afterScatterAgain.props,
        oldType: 'scatter',
        newType: 'bar',
        newSchema: barSchema,
        typePropsCache: afterScatterAgain.typePropsCache,
      });
      // mode/line don't carry forward to bar again, but bar was visited
      // before — no fresh warning.
      expect(revisitBar.dropped).toEqual([]);
    });

    it('does not warn when oldType is falsy (no prior type to have dropped anything from)', () => {
      const { dropped } = preserveTraceProps({
        oldProps: { x: [1], mode: 'lines' },
        oldType: null,
        newType: 'bar',
        newSchema: barSchema,
        typePropsCache: {},
      });
      expect(dropped).toEqual(['mode']);
    });
  });
});
