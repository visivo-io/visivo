/**
 * previewRegistry — backward-compatible shim over the new objectCanvasRegistry
 * (VIS-1001). Kept for one release so existing importers of
 * `getPreviewComponent` / `hasPreview` / `PREVIEW_REGISTRY` keep working while
 * callers migrate to the descriptor registry + <ObjectCanvasFrame>.
 *
 * NOTE: `getPreviewComponent` now returns a React.lazy ref — any direct consumer
 * must mount it under <Suspense>. In practice the only consumer is the Workspace
 * MiddlePane, which goes through <ObjectCanvasFrame> (which provides Suspense).
 */
import {
  OBJECT_CANVAS_REGISTRY,
  getCanvasDescriptor,
  hasCanvas,
} from './objectCanvasRegistry';

export const PREVIEW_REGISTRY = OBJECT_CANVAS_REGISTRY;

export const getPreviewComponent = type => getCanvasDescriptor(type)?.Component || null;

export const hasPreview = type => hasCanvas(type);

export default PREVIEW_REGISTRY;
