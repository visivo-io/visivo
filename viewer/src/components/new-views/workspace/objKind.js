/**
 * OBJ_KIND — single source of truth for object icon + tone.
 *
 * Used by the Workspace shell's `<TabStrip>`, the right-rail kind chip, and
 * (eventually) lineage nodes and Library row icons. Per the delivered B-1
 * design (`design/cofounder-mockups/`), Phase 0 supports six keys:
 * `project | dashboard | chart | insight | model | source`. Track N (Phase 4)
 * extends the map to all object types — when adding a new type, add it here
 * so every surface stays visually consistent.
 *
 * `tone` is a Tailwind background + text pair tuned for the rail chip / tab
 * background; matches the cofounder palette (mulberry for chrome, blue for
 * dashboards, teal for data layer).
 */
import {
  PiCube,
  PiSquaresFour,
  PiChartBar,
  PiLightbulb,
  PiDatabase,
} from 'react-icons/pi';

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
    icon: PiSquaresFour,
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
    icon: PiChartBar,
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
    icon: PiLightbulb,
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
    icon: PiCube,
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
    icon: PiDatabase,
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
