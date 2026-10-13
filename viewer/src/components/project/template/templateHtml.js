import policy from './templatePolicy.json';

// The compile step (visivo/models/dashboards/template_html.py) rejects anything
// outside templatePolicy.json. This re-applies the same policy at render time,
// removing instead of rejecting, because a stored config can reach the viewer
// without passing through compile (cloud edits, a hand-built dist).

export const SLOT_ATTRIBUTE = policy.slot_attribute;

const TAGS = Object.fromEntries(
  Object.entries(policy.tags).map(([tag, attrs]) => [tag, new Set(attrs)])
);
const DOCUMENT_TAGS = new Set(policy.document_tags);
const DROPPED_TAGS = new Set(policy.dropped_tags);
const GLOBAL_ATTRIBUTES = new Set(policy.global_attributes);
const URL_ATTRIBUTES = new Set(policy.url_attributes);
const URL_SCHEMES = new Set(policy.url_schemes.map(scheme => `${scheme}:`));
const DATA_URL_TAGS = new Set(policy.data_url_tags);
const FRAGMENT_ONLY_URL_TAGS = new Set(policy.fragment_only_url_tags);
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

const HEX_DIGITS = '0123456789abcdefABCDEF';

const decodeCssEscapes = css => {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch !== '\\' || i + 1 >= css.length) {
      out += ch;
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < css.length && j - i <= 6 && HEX_DIGITS.includes(css[j])) j += 1;
    if (j > i + 1) {
      const code = parseInt(css.slice(i + 1, j), 16);
      out += code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
      if (j < css.length && ' \t\n\r\f'.includes(css[j])) j += 1;
      i = j;
    } else {
      out += css[i + 1];
      i += 2;
    }
  }
  return out;
};

export const isCssAllowed = css => {
  const decoded = decodeCssEscapes(css).toLowerCase();
  return !policy.css_forbidden.some(token => decoded.includes(token));
};

const normalizeUrl = value =>
  [...value]
    .filter(ch => {
      const code = ch.codePointAt(0);
      return code > 0x20 && code !== 0x7f;
    })
    .join('')
    .toLowerCase();

export const isUrlAllowed = (tag, value) => {
  const url = normalizeUrl(value);
  if (FRAGMENT_ONLY_URL_TAGS.has(tag)) return url.startsWith('#');
  if (url.startsWith('data:')) {
    return DATA_URL_TAGS.has(tag) && policy.data_url_prefixes.some(prefix => url.startsWith(prefix));
  }
  try {
    const { protocol } = new URL(url, 'https://relative.invalid/');
    return URL_SCHEMES.has(protocol);
  } catch {
    return false;
  }
};

export const isAttributeAllowed = (tag, attribute, value) => {
  if (attribute.startsWith('on')) return false;
  const listed =
    GLOBAL_ATTRIBUTES.has(attribute) ||
    policy.attribute_prefixes.some(prefix => attribute.startsWith(prefix)) ||
    TAGS[tag]?.has(attribute);
  if (!listed) return false;
  if (URL_ATTRIBUTES.has(attribute)) return isUrlAllowed(tag, value);
  if (attribute === 'style') return isCssAllowed(value);
  return true;
};

const tagOf = element => element.localName.toLowerCase();

const sanitizeElement = element => {
  const tag = tagOf(element);
  if (DOCUMENT_TAGS.has(tag)) {
    element.replaceWith(...element.childNodes);
    return;
  }
  if (DROPPED_TAGS.has(tag) || !TAGS[tag]) {
    element.remove();
    return;
  }
  if (tag === 'style' && !isCssAllowed(element.textContent)) {
    element.remove();
    return;
  }
  for (const { name, value } of [...element.attributes]) {
    if (!isAttributeAllowed(tag, name.toLowerCase(), value)) element.removeAttribute(name);
  }
  if (tag === 'a' && element.hasAttribute('target')) {
    element.setAttribute('rel', 'noopener noreferrer');
  }
};

const slotNameFor = element => {
  const name = (element.getAttribute(SLOT_ATTRIBUTE) || '').trim();
  if (!name || name.startsWith('ref(') || name.startsWith('${')) return null;
  return name;
};

/**
 * Parse a template dashboard's HTML without running any of it (a <template>
 * element's content is inert), strip what the policy disallows, and turn each
 * `data-visivo-item` element into a host for a named <slot>.
 *
 * Returns `{ fragment, slots }`: `fragment` is the shadow root's content and
 * `slots` lists `{ name, slotName }` in document order — `name` is the item to
 * render, `slotName` the <slot> it is projected into.
 */
export const prepareTemplate = (html, ownerDocument = document) => {
  const template = ownerDocument.createElement('template');
  template.innerHTML = html || '';
  const fragment = template.content;

  fragment.querySelectorAll('*').forEach(element => {
    if (fragment.contains(element)) sanitizeElement(element);
  });

  const slots = [];
  fragment.querySelectorAll(`[${SLOT_ATTRIBUTE}]`).forEach(element => {
    if (!fragment.contains(element) || VOID_TAGS.has(tagOf(element))) return;
    const name = slotNameFor(element);
    if (!name) return;
    const slotName = `visivo-slot-${slots.length}`;
    const slot = ownerDocument.createElement('slot');
    slot.setAttribute('name', slotName);
    element.replaceChildren(slot);
    slots.push({ name, slotName });
  });

  return { fragment, slots };
};

export const templateItemNames = html => [
  ...new Set(prepareTemplate(html).slots.map(slot => slot.name)),
];
