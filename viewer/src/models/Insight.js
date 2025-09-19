import { QueryString } from "../utils/query_string";

export function chartDataFromInsightData(insightsData) {
  if (!insightsData) return [];

  const insights = [];

  for (const [insightName, insightObj] of Object.entries(insightsData)) {
    if (!insightObj?.insight || !insightObj?.columns || !insightObj?.props) continue;

    const { insight, columns, props } = insightObj;

    const dataArrays = {};
    for (const [, field] of Object.entries(columns)) {
      const keyName = field;
      dataArrays[keyName] = insight.map(row => row[keyName]);
    }

    const insight_props = JSON.parse(JSON.stringify(props));
    insight_props.name = insightName;

    const resolveProps = obj => {
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (typeof value === 'string') {
          // Match column(fieldName)
          const match = value.match(/^column\((.+)\)$/);
          if (match) {
            const fieldName = match[1];
            obj[key] = dataArrays[fieldName] || [];
          } else if (QueryString.isQueryString(value)) {
            const queryString = new QueryString(value);
            const queryValue = queryString.getValue()
            const fieldName = queryValue.split('.').pop();
            const colKey = Object.values(columns).find(c => c.includes(fieldName));
            obj[key] = colKey ? dataArrays[colKey] : [];
          }
        } else if (typeof value === 'object' && value !== null) {
          resolveProps(value);
        }
      }
    };

    resolveProps(insight_props);
    insights.push(insight_props);
  }

  return insights;
}
