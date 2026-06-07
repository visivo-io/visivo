import { createContext, useContext } from 'react';

/**
 * ViewItemActionsContext — VIEW-mode item-action consolidation.
 *
 * In View mode the per-item top-right actions (Copy link, Flip to lineage) are
 * consolidated into ONE kebab (⋮) menu owned by <ProjectViewFlipLayer>. To avoid
 * a collision with each leaf item's OWN built-in share/"Copy link" button, the
 * items read this context and SUPPRESS that standalone button when the context
 * reports `suppressItemShare === true`.
 *
 * The context is provided by <Project.jsx> around the render-only <Dashboard>.
 * When the context is absent (embedded / build canvas / other surfaces) the
 * items render their share button exactly as before — behavior only changes when
 * a provider explicitly opts in.
 */
const ViewItemActionsContext = createContext({ suppressItemShare: false });

export const useViewItemActions = () => useContext(ViewItemActionsContext);

export default ViewItemActionsContext;
