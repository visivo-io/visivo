function updateNestedValue(obj, path, newValue) {
    if (!Array.isArray(path) || path.length === 0) {
      throw new Error("Path must be a non-empty array");
    }
  
    let current = obj;
    // Iterate through all keys except the last one
    for (let i = 0; i < path.length - 1; i++) {
      let key = path[i];
  
      // If the key doesn't exist, decide whether to create an array or object.
      // We assume that if the next key is a number, an array is expected.
      if (!(key in current)) {
        current[key] = typeof path[i + 1] === "number" ? [] : {};
      }
  
      current = current[key];
    }
  
    // Update the value at the last key in the path
    current[path[path.length - 1]] = newValue;
  }

  export { updateNestedValue };
  