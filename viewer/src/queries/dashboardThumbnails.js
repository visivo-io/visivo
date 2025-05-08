export const fetchDashboardThumbnail = async dashboard => {
  try {
    const dashboardResponse = await fetch(dashboard.signed_thumbnail_file_url);
    if (!dashboardResponse.ok) {
      return null;
    }
    return await dashboardResponse.blob();
  } catch (error) {
    return null;
  }
};
