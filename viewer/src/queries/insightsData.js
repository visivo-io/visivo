export const fetchInsightData = async insight => {
  const response = await fetch(insight.signed_data_file_url);
  if (!response.ok) {
    throw new Error(`Failed to fetch insight data for ${insight.name}`);
  }
  return response.json();
};
