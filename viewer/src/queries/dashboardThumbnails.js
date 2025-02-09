export const fetchDashboardThumbnail = async (dashboard) => {
    const dashboardResponse = await fetch(dashboard.signed_thumbnail_file_url);
    return await dashboardResponse.blob();
}