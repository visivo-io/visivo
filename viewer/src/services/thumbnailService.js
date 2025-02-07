const sanitizeDashboardName = (name) => {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
};

export const fetchDashboardThumbnail = async (dashboardName) => {
    try {
        const safeName = sanitizeDashboardName(dashboardName);
        const response = await fetch(`/api/thumbnails/${safeName}`);
        
        if (!response.ok) {
            throw new Error('Thumbnail not found');
        }
        
        const data = await response.json();
        return data.thumbnail;
    } catch (error) {
        // Silently fail for missing thumbnails
        return null;
    }
};

export const fetchDashboardThumbnails = (dashboardsByLevel, onThumbnailLoaded) => {
    if (!dashboardsByLevel || Object.keys(dashboardsByLevel).length === 0) {
        return;
    }

    // Process each level in the order they appear in the object
    Object.values(dashboardsByLevel).forEach(dashboards => {
        if (dashboards?.length) {
            // Process each dashboard in the level (already sorted)
            dashboards.forEach(dashboard => {
                fetchDashboardThumbnail(dashboard.name)
                    .then(thumbnail => {
                        if (thumbnail) {
                            onThumbnailLoaded(dashboard.name, thumbnail);
                        }
                    });
            });
        }
    });
};
