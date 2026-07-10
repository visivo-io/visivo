/**
 * fieldGroupCollapseStore (VIS-991)
 *
 * A small, self-contained persisted Zustand store for the schema-form engine's
 * FieldGroup collapse state. Collapse is keyed by `{objectType}.{groupId}` so a
 * group's open/closed state is remembered per object type across reloads (a
 * Dimension's "Advanced" group and a Metric's "Advanced" group are independent).
 *
 * Kept OUT of the main `store.js` persist call on purpose: it owns a single,
 * orthogonal concern and shipping it as its own `persist` store keeps the change
 * isolated (no touching the main store's partialize) while still surviving
 * remounts and reloads. Default semantics: a group with no saved entry is
 * EXPANDED (absence ⇒ not collapsed), matching the "Essentials always open,
 * present fields up front" form ergonomics.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Build the persistence key for a group.
 * @param {string} objectType - e.g. 'dimension'
 * @param {string} groupId - e.g. 'advanced'
 * @returns {string} `{objectType}.{groupId}`
 */
export const collapseKey = (objectType, groupId) => `${objectType || ''}.${groupId || ''}`;

const useFieldGroupCollapseStore = create(
  persist(
    set => ({
      // { [`${objectType}.${groupId}`]: boolean } — true ⇒ collapsed.
      collapsed: {},

      /** Explicitly set a group's collapsed state. */
      setCollapsed: (objectType, groupId, value) =>
        set(state => ({
          collapsed: { ...state.collapsed, [collapseKey(objectType, groupId)]: !!value },
        })),

      /** Toggle a group's collapsed state (absent ⇒ expanded ⇒ toggles to collapsed). */
      toggleCollapsed: (objectType, groupId) =>
        set(state => {
          const key = collapseKey(objectType, groupId);
          return { collapsed: { ...state.collapsed, [key]: !state.collapsed[key] } };
        }),
    }),
    { name: 'field-group-collapse' }
  )
);

/**
 * Effective collapsed state for a group. Absence of a saved entry reads as
 * EXPANDED (false). Shared by the component selector and the toggle so both agree.
 * @param {object} collapsedMap - the store's `collapsed` map
 * @param {string} objectType
 * @param {string} groupId
 * @returns {boolean}
 */
export const isGroupCollapsed = (collapsedMap, objectType, groupId) =>
  !!collapsedMap?.[collapseKey(objectType, groupId)];

export default useFieldGroupCollapseStore;
