import { createContext, useContext } from 'react';

/**
 * ExplorerRoundTripContext — VIS-778 / J-2.
 *
 * When Explorer is mounted inside the Build-mode overlay (the round-trip from
 * "+ New Chart" / "+ New Insight"), this context carries the round-trip
 * descriptor so the existing Explorer surface can adapt WITHOUT being
 * redesigned:
 *
 *   - `<ExplorerRightPanel>` swaps its "Save to Project" button for
 *     "Save and place in slot" and routes the click to `onSaveAndPlace`.
 *
 * Default `null` → normal Explorer entry, surface unchanged.
 *
 * Shape:
 *   {
 *     dashboardName: string,   // origin dashboard
 *     slot: string,            // "<rowIdx>:<itemIdx>" | "<rowIdx>:end" | "new"
 *     saving: boolean,         // overlay is mid-save (disables the surface)
 *     onSaveAndPlace: () => Promise<void>,
 *   }
 */
const ExplorerRoundTripContext = createContext(null);

export const ExplorerRoundTripProvider = ExplorerRoundTripContext.Provider;

export const useExplorerRoundTrip = () => useContext(ExplorerRoundTripContext);

export default ExplorerRoundTripContext;
