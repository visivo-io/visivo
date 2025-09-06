export const fetchInsightsData = async insights => {
  if (insights.length === 0) {
    return {};
  }
  const returnJson = {};
  await Promise.all(
    insights.map(async insight => {
      //This should use react query to reduce calls
      const insightResponse = await fetch(insight.signed_data_file_url);
      const insightJson = await insightResponse.json();
      returnJson[insight.name] = insightJson;
    })
  );
  return returnJson;
};
