import copy from 'copy-to-clipboard';

/**
 * copyItemLink — shared "Copy link" behavior for the consolidated item-action
 * kebab (<ItemActionMenu>), used by BOTH flip layers (View mode's
 * <ProjectViewFlipLayer> and the build canvas's <CanvasItemFlipLayer>).
 *
 * Replicates the items' old built-in share button: copy the current URL with
 * `element_id` set to the scroll offset so the link reopens at this slot.
 */
const copyItemLink = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('element_id', window.scrollY);
  copy(url.toString());
};

export default copyItemLink;
