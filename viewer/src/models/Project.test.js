import { findAllSelectors, getSelectorByOptionName } from './Project';

describe('Project functions', () => {
    const mockProject = {
        project_json: {
            selectors: [{ name: 'selector1' }],
            dashboards: [
                {
                    type: 'internal',
                    rows: [
                        {
                            items: [
                                { selector: { name: 'selector2' } },
                                {
                                    chart: {
                                        selector: { name: 'selector3' }
                                    }
                                },
                                {
                                    table: {
                                        selector: { name: 'selector4' }
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    };

    test('findAllSelectors returns all selectors', () => {
        const result = findAllSelectors(mockProject);
        expect(result).toHaveLength(4);
        expect(result).toEqual(expect.arrayContaining([
            { name: 'selector1' },
            { name: 'selector2' },
            { name: 'selector3' },
            { name: 'selector4' }
        ]));
    });

    test('getSelectorByOptionName returns correct selector', () => {
        const mockProjectWithOptions = {
            ...mockProject,
            project_json: {
                ...mockProject.project_json,
                selectors: [
                    { id: 'selector1', options: [{ name: 'option1' }] },
                    { id: 'selector2', options: [{ name: 'option2' }] }
                ]
            }
        };

        const result = getSelectorByOptionName(mockProjectWithOptions, 'option2');
        expect(result).toEqual({ id: 'selector2', options: [{ name: 'option2' }] });
    });

    test('getSelectorByOptionName returns undefined for non-existent option', () => {
        const result = getSelectorByOptionName(mockProject, 'nonexistent');
        expect(result).toBeUndefined();
    });
});