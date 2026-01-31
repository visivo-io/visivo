import md5 from 'md5';

/**
 * Generate an alphabetical-only hash (a-z) from the input text.
 * Uses MD5 and converts to base26 encoding.
 *
 * Mirrors the Python implementation in visivo/models/base/named_model.py alpha_hash().
 *
 * @param {string} text - Input string to hash
 * @param {number} length - Desired length of output (default 28)
 * @returns {string} Lowercase alphabetical string prefixed with 'm'
 */
export const alphaHash = (text, length = 28) => {
  const hexDigest = md5(text);

  // Convert hex string to BigInt
  // eslint-disable-next-line no-undef
  let hashInt = BigInt('0x' + hexDigest);

  const result = [];
  for (let i = 0; i < length; i++) {
    result.push(String.fromCharCode(97 + Number(hashInt % 26n)));
    hashInt /= 26n;
  }

  return 'm' + result.join('');
};
