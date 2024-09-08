export const findAllSelectors = (project) => {
    const selectors = [...project.project_json.selectors]
    project.project_json.dashboards.forEach((dashboard) => {
        dashboard.rows.forEach((row) => {
            row.items.forEach((item) => {
                if (item.selector) {
                    selectors.push(item.selector)
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
