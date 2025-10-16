/**
 * Fetch insight data files from the server
 * Format: insight has files array with {name_hash, signed_data_file_url}
 * @param {Object} insight - Insight object with files array
 * @returns {Promise<Object>} - Object with files, query, and props_mapping
 */
export const fetchInsightData = async insight => {
  return {
    files: insight.files,
    query: insight.query,
    props_mapping: insight.props_mapping,
    name: insight.name,
  };
};
