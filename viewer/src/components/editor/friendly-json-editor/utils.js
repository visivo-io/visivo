// Split description into suggestion and explanation parts
export const splitDescription = (description) => {
  if (!description) return { suggestion: '', explanation: '' };
  const parts = description.split('<br>');
  return {
    suggestion: parts[0] || '',
    explanation: parts.length > 1 ? parts.slice(1).join('<br>') : ''
  };
};

// Format property key for display
export const formatKey = (key) => 
  key.split('_')
     .map(word => word.charAt(0).toUpperCase() + word.slice(1))
     .join(' '); 