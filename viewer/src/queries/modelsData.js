export const fetchModelsData = async models => {
  if (models.length === 0) {
    return {};
  }
  const returnJson = {};
  await Promise.all(
    models.map(async model => {
      const response = await fetch(model.signed_data_file_url);
      const json = await response.json();
      returnJson[model.name] = json;
    })
  );
  return returnJson;
};
