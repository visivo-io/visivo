# Using AI to Build Dashboards

## 🤖 Agent AI-Powered Development with Claude Code

Use the power of an AI Agent to iteratively create and refine your dashboard configuration through conversation. This approach is perfect for rapid prototyping and learning Visivo's capabilities.  It can give you a starting point very quickly.

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

### Considerations

- Telling your agents to run `visivo run` to validate the configuration is very important.
- This is a continuously improving technique and we welcome feedback.

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