/**
 * objKind — the Workspace shell's object-kind icon + tone map (VIS-775).
 *
 * Guards that object-type icons resolve through the app-wide canonical
 * `objectTypeConfigs.js` (MUI icons) so the tab strip + right-rail kind chip
 * match the Library, `/editor`, the lineage nodes, and every edit form.
 */
import { OBJ_KIND, getKind } from './objKind';
import { getTypeIcon } from '../common/objectTypeConfigs';

describe('objKind', () => {
  test('object-type icons come from the canonical objectTypeConfigs', () => {
    ['dashboard', 'chart', 'insight', 'model', 'source'].forEach(t => {
      expect(OBJ_KIND[t].icon).toBe(getTypeIcon(t));
    });
  });

  test('every kind carries an icon, a label, and a tone', () => {
    Object.values(OBJ_KIND).forEach(kind => {
      expect(kind.icon).toBeTruthy();
      expect(typeof kind.label).toBe('string');
      expect(kind.tone).toBeTruthy();
    });
  });

  test('getKind falls back to the dashboard kind for unknown types', () => {
    expect(getKind('not-a-real-type')).toBe(OBJ_KIND.dashboard);
  });
});
