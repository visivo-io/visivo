import {
  canvasLevelLabels,
  editorLevelLabels,
  assertSurfacesMatch,
} from './parityTestUtils';

describe('parityTestUtils', () => {
  describe('canvasLevelLabels', () => {
    test('extracts level titles in order, excluding the Unassigned bucket', () => {
      const groups = [
        { levelKey: 'level:0', title: 'Org' },
        { levelKey: 'level:1', title: 'Dept' },
        { levelKey: '__unassigned__', title: 'Unassigned' },
      ];
      expect(canvasLevelLabels(groups)).toEqual(['Org', 'Dept']);
    });

    test('handles empty / nullish input', () => {
      expect(canvasLevelLabels([])).toEqual([]);
      expect(canvasLevelLabels(null)).toEqual([]);
      expect(canvasLevelLabels(undefined)).toEqual([]);
    });
  });

  describe('editorLevelLabels', () => {
    test('extracts titles in order', () => {
      expect(editorLevelLabels([{ title: 'A' }, { title: 'B' }])).toEqual(['A', 'B']);
    });

    test('handles nullish input', () => {
      expect(editorLevelLabels(null)).toEqual([]);
    });
  });

  describe('assertSurfacesMatch', () => {
    test('passes when labels match in order', () => {
      expect(() =>
        assertSurfacesMatch({ objectType: 'levels', canvas: ['A', 'B'], editor: ['A', 'B'] })
      ).not.toThrow();
    });

    test('throws on length mismatch', () => {
      expect(() =>
        assertSurfacesMatch({ objectType: 'levels', canvas: ['A'], editor: ['A', 'B'] })
      ).toThrow(/parity mismatch for "levels"/);
    });

    test('throws on order mismatch and reports both lists', () => {
      expect(() =>
        assertSurfacesMatch({ objectType: 'levels', canvas: ['A', 'B'], editor: ['B', 'A'] })
      ).toThrow(/canvas: \["A","B"\][\s\S]*editor: \["B","A"\]/);
    });

    describe('prefix mode (canvas windowing on the shared source)', () => {
      test('passes when canvas is an in-order prefix of editor', () => {
        expect(() =>
          assertSurfacesMatch({
            objectType: 'levels',
            canvas: ['A'],
            editor: ['A', 'B', 'C'],
            mode: 'prefix',
          })
        ).not.toThrow();
      });

      test('passes when both are empty', () => {
        expect(() =>
          assertSurfacesMatch({ objectType: 'levels', canvas: [], editor: [], mode: 'prefix' })
        ).not.toThrow();
      });

      test('throws when canvas non-empty but editor empty (the VIS-899 bug)', () => {
        expect(() =>
          assertSurfacesMatch({
            objectType: 'levels',
            canvas: ['A'],
            editor: [],
            mode: 'prefix',
          })
        ).toThrow(/parity mismatch for "levels" \(mode=prefix\)/);
      });

      test('throws when canvas is not an in-order prefix', () => {
        expect(() =>
          assertSurfacesMatch({
            objectType: 'levels',
            canvas: ['B'],
            editor: ['A', 'B'],
            mode: 'prefix',
          })
        ).toThrow(/parity mismatch/);
      });
    });
  });
});
