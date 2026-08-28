import { DEFAULT_COLORS } from './objectTypeConfigs';

/**
 * A `${ref(...)}` rendered as EDITABLE literal text rather than a chip.
 *
 * "Manually edit field…" is the escape hatch for expressions the pill can't
 * model, but `RefTextArea` still rendered every ref as a
 * `contenteditable="false"` chip — so the ref was the one part of the text the
 * user could not actually edit. This node's textContent IS the literal
 * `${ref(name).property}`, so it serializes back through the same plain-text
 * path a hand-typed ref does: `serializeContentEditableToRefString` only
 * special-cases elements carrying `data-ref-name`, and this deliberately
 * carries none, recursing into it as ordinary text instead.
 *
 * The span earns its keep as a styling hook. A name that resolves to no known
 * object is marked `data-ref-unknown` and underlined, so a bad reference can be
 * called out without taking the text away from the user — the reason to stay on
 * a contentEditable here rather than drop to a plain <textarea>.
 *
 * @param {string} name - the referenced object's name
 * @param {string|null} property - optional trailing `.property`
 * @param {object|null} typeConfig - resolved type config, or null when the name
 *   matches no known object in the project
 * @returns {HTMLSpanElement}
 */
export function createRefTokenElement(name, property, typeConfig) {
  const known = !!typeConfig;
  const token = document.createElement('span');
  token.setAttribute('data-ref-token', name);
  if (!known) token.setAttribute('data-ref-unknown', 'true');
  token.className = known
    ? `${typeConfig.colors?.text || DEFAULT_COLORS.text} font-medium`
    : 'text-red-600 underline decoration-wavy decoration-red-400';
  token.textContent = property ? `\${ref(${name}).${property}}` : `\${ref(${name})}`;
  return token;
}

export default createRefTokenElement;
