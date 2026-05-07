export const ROLES = [
  {
    id: 'analytics_engineer',
    label: 'Analytics Engineer',
    desc: 'I model warehouse data and ship trusted metrics.',
    icon: '⚒︎',
  },
  {
    id: 'data_engineer',
    label: 'Data Engineer',
    desc: 'I build pipelines and own data infrastructure.',
    icon: '⚙︎',
  },
  {
    id: 'bi_analyst',
    label: 'BI / Data Analyst',
    desc: 'I answer business questions with charts and SQL.',
    icon: '◔',
  },
  {
    id: 'product_analyst',
    label: 'Product Analyst',
    desc: 'I dig into product usage and run experiments.',
    icon: '◎',
  },
  {
    id: 'software_engineer',
    label: 'Software Engineer',
    desc: 'I write code; BI is something I do on the side.',
    icon: '<>',
  },
  {
    id: 'data_scientist',
    label: 'Data Scientist / ML Engineer',
    desc: 'I build models and need to monitor them.',
    icon: 'fx',
  },
  {
    id: 'founder',
    label: 'Founder or Solo Operator',
    desc: "I want to see what's happening in my company.",
    icon: '★',
  },
  {
    id: 'executive',
    label: 'Executive / Decision Maker',
    desc: 'I want clean dashboards I can trust.',
    icon: '◇',
  },
  {
    id: 'consultant',
    label: 'Consultant / Agency',
    desc: 'I deliver dashboards for multiple clients.',
    icon: '◈',
  },
  {
    id: 'other',
    label: 'Other / Just exploring',
    desc: "I'm kicking the tires, no specific goal yet.",
    icon: '?',
  },
];

export const PERSONA_CONTENT = {
  analytics_engineer: {
    intent: "You're modeling warehouse data and shipping trusted metrics with code review.",
    sample: 'ev-sales',
    cloud_framing:
      "You'll likely care about CI checks, dbt-style code review, and shared sources for the team.",
    first_check: 'Connect your warehouse',
    source_example:
      'Point at your Snowflake or BigQuery account — credentials live on your machine, never in Visivo.',
    model_example:
      'Re-use your dbt models, or write SQL directly. `weekly_revenue.sql` becomes a Visivo Model with one file.',
    semantic_example:
      'Define `revenue` as a Metric on your `orders` Model once. Every chart, every dashboard, every team uses the same definition — no more "whose number is right?"',
    insight_example:
      'A weekly revenue chart with a YoY overlay — exactly the metric your stakeholders ask for in standup.',
    chart_example:
      'Combine the weekly revenue line with a "vs target" KPI in one chart. The number tells you where, the line tells you why.',
    input_example:
      'A "fiscal quarter" dropdown lets stakeholders self-serve without you opening Looker.',
    dashboard_example:
      'Your "Q3 Metrics Review" is a YAML file you can code-review in PR like everything else you ship.',
  },
  data_engineer: {
    intent: "You're building pipelines and want BI to fit your existing infra.",
    sample: 'ev-sales',
    cloud_framing:
      "You'll likely care about scheduled refreshes, deploy hooks, and CI parity with your data warehouse.",
    first_check: 'Connect your warehouse',
    source_example:
      'DuckDB locally, then point at the same Snowflake credentials your dbt project uses.',
    model_example:
      'Models are just SQL files — version-control them next to your dbt repo. No new schema.',
    semantic_example:
      'Define pipeline `freshness_minutes` as a Metric and `source_name` as a Dimension. Every health chart slices the same way.',
    insight_example: 'Pipeline health: rows-loaded by source, last 24h.',
    chart_example:
      'A "rows loaded today" KPI next to the trailing-7-day trendline — one chart, two answers.',
    input_example:
      'A pipeline filter lets ops drill into one source without you spinning up a new view.',
    dashboard_example:
      'A "Data Platform Status" dashboard you deploy from CI like any other artifact.',
  },
  bi_analyst: {
    intent:
      "You're answering business questions and building charts faster than ad-hoc SQL allows.",
    sample: 'ev-sales',
    cloud_framing:
      "You'll likely care about scheduled email reports and sharing dashboards with stakeholders.",
    first_check: 'Connect your data warehouse',
    source_example: 'Connect to your warehouse the same way you would in your SQL editor.',
    model_example:
      'Save the queries you write 100 times a week as Models — re-use, don\'t re-type.',
    semantic_example:
      'Define `gross_margin` once as a Metric and `region` as a Dimension. Stakeholders stop asking "is this number right?" because it\'s the same definition everywhere.',
    insight_example:
      "Sales by region with last-week comparison — the chart you'd build in Tableau, but versioned.",
    chart_example:
      'A regional revenue table with an embedded sparkline per row — Tableau\'s "show me" without the licence.',
    input_example:
      'A region picker means stakeholders stop pinging you for "the same chart but for EMEA."',
    dashboard_example:
      "A weekly business review that updates itself, embedded in your team's wiki.",
  },
  product_analyst: {
    intent: "You're analyzing product usage and running experiments.",
    sample: 'ev-sales',
    cloud_framing:
      "You'll likely care about sharing experiment readouts with PM and engineering.",
    first_check: 'Connect your event store',
    source_example: 'Point at your event warehouse — Snowflake, BigQuery, Redshift.',
    model_example:
      '`weekly_active_users.sql` becomes a Model — one source of truth your team can trust.',
    semantic_example:
      'Define `WAU` and `activation_rate` as Metrics. Define `experiment_arm` and `cohort` as Dimensions. Now every funnel uses the same math.',
    insight_example: 'Funnel chart: signup → activated → retained, week-over-week.',
    chart_example:
      'Activation funnel + a big "Δ vs control" KPI side-by-side. PM gets the headline and the detail in one frame.',
    input_example:
      'An experiment-arm dropdown so PM can read out their own A/B without pinging you.',
    dashboard_example: 'A "Q3 Experiment Review" you publish to the team wiki on demand.',
  },
  software_engineer: {
    intent: "You're writing code and BI is something you do on the side.",
    sample: 'github-releases',
    cloud_framing:
      "You'll likely care about Git-native workflow, CI, and the fact that there's no proprietary GUI to learn.",
    first_check: 'Connect a database',
    source_example: 'A local Postgres, or DuckDB pointing at a CSV — same as the rest of your stack.',
    model_example:
      'A `.sql` file in your repo. That\'s it. Run `visivo serve` and watch it become a queryable Model.',
    semantic_example:
      'Define `releases_per_week` as a Metric and `repo` as a Dimension in YAML. Now every chart in your engineering wiki uses the same numbers.',
    insight_example: 'Releases-per-week — a chart you can drop into your engineering README.',
    chart_example:
      'A "deploys today" big number paired with a 30-day deploys-per-day chart. README-ready.',
    input_example: 'A repo filter so you can show one repo at a time without forking the dashboard.',
    dashboard_example:
      'A dashboard that lives in `dashboards/release-velocity.yaml`, code-reviewed like anything else.',
  },
  data_scientist: {
    intent: "You're building models and need to monitor them once they ship.",
    sample: 'ev-sales',
    cloud_framing:
      "You'll likely care about scheduled refreshes for model-monitoring dashboards and notebook handoff.",
    first_check: 'Connect your feature store',
    source_example:
      'Point at your warehouse or feature store — same connection string you use in your notebook.',
    model_example:
      "Wrap your model's prediction table as a Model. Now drift charts are one query, not a Jupyter rerun.",
    semantic_example:
      'Define `prediction_drift` and `auc` as Metrics, `model_version` as a Dimension. Every monitoring chart speaks the same language.',
    insight_example: 'Prediction-vs-actual for the last 30 days, broken out by segment.',
    chart_example:
      'Model AUC big-number with the rolling-7-day trend below it. One glance tells you if you need to retrain.',
    input_example:
      'A model-version dropdown so you can compare v1 vs v2 without rebuilding the chart.',
    dashboard_example: 'An "ML Health" dashboard that updates nightly and pings you when drift exceeds threshold.',
  },
  founder: {
    intent:
      "You want to see what's happening in your company without paying for a BI seat per person.",
    sample: 'ev-sales',
    cloud_framing:
      "You'll likely care about sharing one dashboard with the whole team, and not paying per-seat for everyone.",
    first_check: 'Connect Stripe, Postgres, or upload a CSV',
    source_example: 'Stripe export, Postgres, or just a CSV from your accountant.',
    model_example: '`mrr.sql` becomes the one chart you check every Monday. No more spreadsheets.',
    semantic_example:
      'Define `mrr`, `new_customers`, and `churn_rate` once. Every chart in your investor update uses the same numbers.',
    insight_example: 'Monthly recurring revenue and net new customers, side-by-side.',
    chart_example:
      'MRR big number + monthly trendline + "vs last month" delta — the only chart on your Monday-morning page.',
    input_example: 'A "compare to last quarter" toggle for board meetings.',
    dashboard_example: 'Your "Investor Update" dashboard — one URL you share with your board.',
  },
  executive: {
    intent: 'You want clean dashboards you can trust, without building them yourself.',
    sample: 'ev-sales',
    cloud_framing:
      "You'll likely care about scheduled email reports landing in your inbox every Monday at 8am.",
    first_check: 'Open the example dashboard',
    source_example:
      'Your team will connect this — what matters is that the numbers come from the same warehouse your team queries.',
    model_example:
      'A Model is a "metric definition." Once it\'s defined, every chart that uses it stays consistent.',
    semantic_example:
      'Your team defines `revenue`, `pipeline`, and `region` once. You can trust that every chart you see is using the same definition.',
    insight_example: 'Quarterly revenue with target vs actual — the slide you live with in board meetings.',
    chart_example:
      'Revenue KPI alongside the quarterly trend — one tile that answers "how are we doing?" at a glance.',
    input_example:
      'A region or product-line dropdown so you can drill in without asking your analyst.',
    dashboard_example:
      'A board pack that updates itself — no last-minute scramble before the meeting.',
  },
  consultant: {
    intent: "You're delivering dashboards for multiple clients and need them version-controlled.",
    sample: 'ev-sales',
    cloud_framing:
      "You'll likely care about per-client deployments and being able to white-label the result.",
    first_check: "Connect your first client's warehouse",
    source_example: 'Each client is a Source. Credentials live in their environment, not yours.',
    model_example:
      'A reusable "Models" repo per client lets you ship a starter pack on day one.',
    semantic_example:
      'A starter `metrics.yaml` per client — `arr`, `health_score`, `nps` — that you re-use across every dashboard you ship.',
    insight_example: 'Customer health score — a chart you can re-skin per client.',
    chart_example:
      'A client health KPI plus a 90-day trend per account. One template, every client looks the same.',
    input_example:
      "A client-account picker if you're managing more than one in the same project.",
    dashboard_example: 'One "Q3 Review" template, deployed once per client. Yaml in, dashboard out.',
  },
  other: {
    intent: "You're kicking the tires and want to see what this thing is good for.",
    sample: 'college-football',
    cloud_framing:
      'No pressure on cloud — try the local viewer first and see if Visivo fits how you think.',
    first_check: 'Pick a sample dashboard',
    source_example: 'A built-in DuckDB sample is the fastest way to see what a Source is.',
    model_example: 'Pre-written SQL — read it, edit it, see the chart update.',
    semantic_example:
      'Pre-defined Metrics like `total_units` and `yoy_growth`. See how one definition powers a dozen charts.',
    insight_example: "A bar chart that already works. Click into it to see how it's built.",
    chart_example:
      'A KPI with a sparkline. The kind of dense tile every "executive dashboard" promises but rarely delivers.',
    input_example: 'Drag a slider, watch a chart update. The whole point of "interactive."',
    dashboard_example: "A 12-chart dashboard that's editable inline.",
  },
};

export const SAMPLES = {
  'ev-sales': {
    name: 'ev-sales',
    title: 'EV Sales',
    desc: 'US electric vehicle adoption by state, model, and quarter.',
    art: 'bars-warm',
    schema: 'duckdb · 14 charts',
    apiKey: 'ev-sales',
  },
  'github-releases': {
    name: 'github-releases',
    title: 'GitHub Releases',
    desc: 'Release cadence and contributors across popular OSS repos.',
    art: 'line-up',
    schema: 'duckdb · 9 charts',
    apiKey: 'github-releases',
  },
  'college-football': {
    name: 'college-football',
    title: 'College Football',
    desc: 'Win probability + expected points across seasons.',
    art: 'scatter',
    schema: 'csv · 12 charts',
    apiKey: 'college-football',
  },
};

export const CONCEPTS = [
  {
    id: 'source',
    title: 'Source',
    def: 'A Source is a connection to where your data already lives — a database, warehouse, or file.',
  },
  {
    id: 'model',
    title: 'Model',
    def:
      "A Model is a SQL query saved as a file — a re-usable, versioned dataset that's the foundation of everything you build.",
  },
  {
    id: 'semantic',
    title: 'Semantic layer',
    def:
      'On top of a Model you define Metrics (what you\'re measuring), Dimensions (how you slice it), and Relations (how Models join). Define once, re-use everywhere.',
  },
  {
    id: 'insight',
    title: 'Insight',
    def:
      'An Insight is a single visual — a bar, line, KPI, or table — answering one question against the semantic layer.',
  },
  {
    id: 'chart',
    title: 'Chart',
    def:
      'A Chart combines Insights into a richer view — a big number with a sparkline, a table beside a trendline, an annotated time series.',
  },
  {
    id: 'input',
    title: 'Input',
    def:
      'An Input is an interactive control — a dropdown, slider, or toggle that filters Charts and Insights live.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    def:
      'A Dashboard arranges Charts, Insights, and Inputs into a page that tells a complete story.',
  },
];

export function rolePluralLabel(roleId) {
  const meta = ROLES.find(r => r.id === roleId);
  if (!meta) return null;
  if (/Engineer$|Analyst$|Scientist$/.test(meta.label)) return `${meta.label}s`;
  if (meta.label === 'BI / Data Analyst') return 'BI Analysts';
  if (meta.label === 'Founder or Solo Operator') return 'Founders';
  if (meta.label === 'Data Scientist / ML Engineer') return 'Data Scientists';
  return meta.label;
}
