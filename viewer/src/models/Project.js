export const findAllSelectors = (project) => {
    const selectors = []
    if (project.project_json.selectors) {
        selectors.push(...project.project_json.selectors)
    }
    project.project_json.dashboards.forEach((dashboard) => {
        dashboard.rows.forEach((row) => {
            row.items.forEach((item) => {
                if (item.selector) {
                    selectors.push(item.selector)
                }
                if (item.chart && item.chart.selector) {
                    selectors.push(item.chart.selector)
                }
                if (item.table && item.table.selector) {
                    selectors.push(item.table.selector)
                }
            })
        })
    })
    return selectors
};

export const getSelectorByOptionName = (project, name) => {
    const allSelectors = findAllSelectors(project);
    return allSelectors.find(selector =>
        selector.options && selector.options.some(option => option.name === name)
    );
};
