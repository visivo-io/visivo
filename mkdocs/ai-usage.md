# Using AI to Build Dashboards

## 🤖 Agent AI-Powered Development with Claude Code

Use the power of an AI Agent to iteratively create and refine your dashboard configuration through conversation. This approach is perfect for rapid prototyping and learning Visivo's capabilities.

!!! success "Why Agent AI Works Better"
    AI Agents like Claude Code can read files, run commands, and iterate on solutions. This approach lets you:

    - Start with a working example tailored to your needs
    - Test and validate configurations automatically
    - Iterate quickly through conversation and feedback
    - Learn Visivo's syntax through guided exploration

---

## Getting Started with AI

### 1. Create Your Project Directory

```bash
mkdir my-dashboard
cd my-dashboard
```

### 2. Use This Prompt with Claude Code

Copy the following prompt and paste it into Claude Code or similar AI Agent. This prompt is designed to accept CSV files as a data source, but feel free to modify.

!!! example "Dashboard Generation Prompt"
    ```
    Create a Visivo dashboard from my data located here: [YOUR DATA HERE].

    Requirements:
    - Load data from either:
      * A CSV file(s) I provide above, OR
      * This sample retail dataset: https://raw.githubusercontent.com/visivo-io/visivo/main/mkdocs/assets/us_land_use.csv
    - Analyze the data and create at least 3 different charts showing different insights
    - Read the docs at docs.visivo.io to know how Visivo works and create a project.visivo.yml.  The general syntax is located under the configuration heading.
    - If the data provided is a CSV use Visivo's CSVFileSource and the docs are located at: https://docs.visivo.io/reference/configuration/Sources/CSVFileSource/ to load that data.
    - Validate the visivo configuration with `visivo run`.
    - Provide the complete project.visivo.yml file with inline comments explaining each section.
    ```

### 3. Iterate and Refine

Work with the AI Agent to save, test, and refine the configuration:

- Serve the dashboard with `visivo serve`
- Ask the Agent to modify charts, add features, or fix any issues
- Continue the conversation until your dashboard is perfect

### 4. Launch Your Dashboard

```bash
visivo serve
```

---

## Advanced AI Techniques

### Working with Real Data

When you have your own dataset, enhance the prompt with specific requirements:

!!! example "Custom Data Prompt"
    ```
    I have a dataset with the following columns: [LIST YOUR COLUMNS].

    Create a Visivo dashboard that:
    - Shows trends over time (if applicable)
    - Includes comparison charts between categories
    - Highlights key performance indicators
    - Uses appropriate chart types for each data type

    Please analyze the data first and suggest the most insightful visualizations.
    ```

### Iterative Development

Use follow-up prompts to refine your dashboard:

- **"Add a filter to let users select date ranges"**
- **"Change the bar chart to a line chart and add a trend line"**
- **"Create a summary table showing key metrics"**
- **"Add interactive hover tooltips with more details"**

### Data Source Integration

For connecting to databases, provide connection details:

!!! example "Database Connection Prompt"
    ```
    Connect to my [PostgreSQL/MySQL/Snowflake] database and create a dashboard.

    Connection details:
    - Host: [your-host]
    - Database: [your-database]
    - Schema: [your-schema]

    Tables of interest:
    - [table1]: Contains [description]
    - [table2]: Contains [description]

    Create visualizations that show [specific business questions].
    ```

---

## AI Development Workflow

### 1. **Explore & Understand**
   - Upload your data or describe your requirements
   - Let the AI analyze and suggest visualization approaches
   - Review the generated configuration together

### 2. **Build & Test**
   - Generate the initial `project.visivo.yml`
   - Run `visivo run` to validate the configuration
   - Serve the dashboard with `visivo serve`

### 3. **Iterate & Improve**
   - Identify areas for improvement
   - Ask the AI to make specific modifications
   - Test changes and provide feedback

### 4. **Polish & Deploy**
   - Fine-tune styling and layout
   - Add interactive features
   - Prepare for deployment

---

## Tips for Effective AI Collaboration

### Be Specific with Requirements

Instead of: *"Make a nice dashboard"*

Try: *"Create a sales dashboard with monthly revenue trends, top-performing products, and regional comparison charts"*

### Provide Context

Help the AI understand your business needs:

- What decisions will this dashboard inform?
- Who is the intended audience?
- What are the key metrics that matter?
- Are there any specific design preferences?

### Iterate in Small Steps

Rather than asking for everything at once:

1. Start with basic charts
2. Add interactivity
3. Enhance styling
4. Optimize performance

### Test Frequently

- Run `visivo run` after each major change
- Serve the dashboard to see visual results
- Provide feedback on what works and what doesn't

---

## Common AI Prompts

### Quick Fixes
- *"The chart title is too small, make it larger"*
- *"Change the color scheme to use blue tones"*
- *"Add a tooltip showing the exact values"*

### Feature Additions
- *"Add a dropdown filter for product categories"*
- *"Create a summary card showing total revenue"*
- *"Add a second chart comparing this year vs last year"*

### Data Issues
- *"The date column isn't being parsed correctly"*
- *"Some values are showing as null, can we filter those out?"*
- *"The numbers need to be formatted as currency"*

### Styling Changes
- *"Make the dashboard look more professional"*
- *"Use our company colors: #1f77b4 and #ff7f0e"*
- *"Arrange the charts in a 2x2 grid layout"*

---

## Next Steps

Once you have a working dashboard created with AI assistance:

<div class="grid cards" markdown>

-   :material-palette:{ .lg .middle } **Customize Styling**

    ---

    Learn manual configuration for advanced customization

    [:octicons-arrow-right-24: Dashboard customization](reference/configuration/Dashboards/Dashboard/index.md)

-   :material-database:{ .lg .middle } **Connect Production Data**

    ---

    Set up connections to your production databases

    [:octicons-arrow-right-24: Data sources](topics/sources.md)

-   :material-cloud-upload:{ .lg .middle } **Deploy & Share**

    ---

    Share your dashboards with your team

    [:octicons-arrow-right-24: Deployment guide](topics/deployments.md)

-   :material-lightning-bolt:{ .lg .middle } **Quick Start Alternative**

    ---

    Try the instant example dashboard approach

    [:octicons-arrow-right-24: Quick Start](index.md)

</div>

---

**Questions about AI development?** [Contact us](mailto:jared@visivo.io) - we're here to help!