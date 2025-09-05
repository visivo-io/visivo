function getRelativePath(base, target) {
  // Handle null, undefined, or non-string inputs
  if (!base || typeof base !== 'string') {
    return target || '';
  }
  if (!target || typeof target !== 'string') {
    return '';
  }
  
  // Remove leading slashes and split by '/'
  const baseParts = base.replace(/^\//, '').split('/');
  const targetParts = target.replace(/^\//, '').split('/');

  // Find the first index where parts differ
  let samePartsLength = 0;
  while (
    samePartsLength < baseParts.length &&
    samePartsLength < targetParts.length &&
    baseParts[samePartsLength] === targetParts[samePartsLength]
  ) {
    samePartsLength++;
  }

  // Count how many directories we need to go up from base
  const upwardMoves = baseParts.length - samePartsLength;
  const relativeParts = Array(upwardMoves).fill('.');

  // Append the parts of target that didn't match
  const nonMatchingTargetParts = targetParts.slice(samePartsLength);
  if (base === target) {
    return './' + target.split('/').pop();
  } else {
    return [...relativeParts, ...nonMatchingTargetParts].join('/');
  }
}

function updateNestedValue(obj, path, newValue) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('Path must be a non-empty array');
  }

  let current = obj;
  // Iterate through all keys except the last one
  for (let i = 0; i < path.length - 1; i++) {
    let key = path[i];

    // If the key doesn't exist, decide whether to create an array or object.
    // We assume that if the next key is a number, an array is expected.
    if (!(key in current)) {
      current[key] = typeof path[i + 1] === 'number' ? [] : {};
    }

    current = current[key];
  }

  // Update the value at the last key in the path
  current[path[path.length - 1]] = newValue;
}

export { updateNestedValue, getRelativePath };
