/**
 * OBJ_KIND — single source of truth for an object kind's icon + tone.
 *
 * Used by the Workspace shell's `<TabStrip>` and the right-rail kind chip.
 * Per the delivered B-1 design (`design/cofounder-mockups/`), Phase 0 supports
 * six keys: `project | dashboard | chart | insight | model | source`. Track N
 * (Phase 4) extends the map to all object types — when adding a new type, add
 * it here so every surface stays visually consistent.
 *
 * Object-type `icon`s are pulled from the app-wide canonical
 * `objectTypeConfigs.js` (MUI icons) so the tab strip matches the Library,
 * `/editor`, the lineage nodes, and every edit form. `project` is not a data
 * object — it keeps a Phosphor icon. `tone` is a Tailwind background + text
 * pair tuned for the rail chip / tab background; it matches the cofounder
 * palette (mulberry for chrome, blue for dashboards, teal for data layer).
 */
import { PiCube } from 'react-icons/pi';
import { getTypeIcon } from '../common/objectTypeConfigs';

export const OBJ_KIND = {
  project: {
    icon: PiCube,
    label: 'Project',
    tone: {
      bg: 'bg-[#d4e1e2]',
      fg: 'text-[#1b4042]',
      chipBg: 'bg-[#d4e1e2]/60',
      chipFg: 'text-[#1b4042]',
      chipRing: 'ring-[#1b4042]/15',
    },
  },
  dashboard: {
    icon: getTypeIcon('dashboard'),
    label: 'Dashboard',
    tone: {
      bg: 'bg-[#e6edf8]',
      fg: 'text-[#1e3a5f]',
      chipBg: 'bg-[#e6edf8]/60',
      chipFg: 'text-[#1e3a5f]',
      chipRing: 'ring-[#1e3a5f]/15',
    },
  },
  chart: {
    icon: getTypeIcon('chart'),
    label: 'Chart',
    tone: {
      bg: 'bg-[#e2d7dd]',
      fg: 'text-[#5a2f45]',
      chipBg: 'bg-[#e2d7dd]/60',
      chipFg: 'text-[#5a2f45]',
      chipRing: 'ring-[#5a2f45]/15',
    },
  },
  insight: {
    icon: getTypeIcon('insight'),
    label: 'Insight',
    tone: {
      bg: 'bg-[#d4e1e2]',
      fg: 'text-[#1b4042]',
      chipBg: 'bg-[#d4e1e2]/60',
      chipFg: 'text-[#1b4042]',
      chipRing: 'ring-[#1b4042]/15',
    },
  },
  model: {
    icon: getTypeIcon('model'),
    label: 'Model',
    tone: {
      bg: 'bg-[#d4e1e2]',
      fg: 'text-[#1b4042]',
      chipBg: 'bg-[#d4e1e2]/60',
      chipFg: 'text-[#1b4042]',
      chipRing: 'ring-[#1b4042]/15',
    },
  },
  source: {
    icon: getTypeIcon('source'),
    label: 'Source',
    tone: {
      bg: 'bg-[#d4e1e2]',
      fg: 'text-[#1b4042]',
      chipBg: 'bg-[#d4e1e2]/60',
      chipFg: 'text-[#1b4042]',
      chipRing: 'ring-[#1b4042]/15',
    },
  },
};

/** Safe lookup — falls back to the dashboard tone for unknown types. */
export const getKind = (type) => OBJ_KIND[type] || OBJ_KIND.dashboard;
