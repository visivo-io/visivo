# Quick Start

## 🚀 Data to Dashboard in 90 Seconds

Transform your data into interactive dashboards with a single command. No configuration files, no complex setup—just instant visualization.

### Install Visivo

```bash
curl -fsSL https://visivo.sh | bash
```

!!! success "One command, all platforms"
    Our installation script handles macOS, Linux, and Windows automatically. No Python required!

### Choose Your Path

<div class="grid cards" markdown>

-   :material-lightning-bolt:{ .lg .middle } **Instant Dashboard with `visivo serve`**

    ---

    Start with a working example dashboard and customize it to your needs.

    ```bash
    visivo serve
    ```

    [:octicons-arrow-right-24: Follow the serve path](#serve-path-example-dashboard)

-   :material-robot:{ .lg .middle } **Agent AI-Powered with Claude Code**

    ---

    Use an AI Agent to iteratively build and refine your dashboard through conversation.

    **Perfect for:** Rapid prototyping and learning Visivo's capabilities

    [:octicons-arrow-right-24: Follow the Agent AI path](#agent-ai-path-build-with-claude-code)

</div>

---

## Serve Path: Example Dashboard

The simplest way to get started—run one command and explore a working dashboard!

### 1. Run the Command

```bash
visivo serve
```

### 2. Choose an Example

Visivo will prompt you to select from several example dashboards, then:

- Initialize the chosen example into your current directory
- Create a complete `project.visivo.yml` configuration file
- Load sample data and refresh your browser to show the new configuration

Each example includes:
- Pre-configured sample data
- Multiple chart types to explore
- Interactive filters and controls
- A complete configuration to learn from

### 3. Make It Your Own

The example dashboard is fully functional and editable:
- Open the generated `project.visivo.yml` in your editor
- Modify any part of the configuration
- Save and watch your changes appear instantly

!!! tip "What happens behind the scenes"
    When you run `visivo serve` without a config file, Visivo:
    
    1. Prompts you to choose from available examples
    2. Initializes the selected example into your directory
    3. Loads sample data into DuckDB
    4. Renders the dashboard with hot-reload enabled
    5. Opens your browser to show the result

Now jump to [Experience Live Development](#experience-live-development) to see the magic of instant updates!

---

## Agent AI Path: Build with Claude Code

Use the power of an AI Agent to iteratively create and refine your dashboard configuration through conversation.

### 1. Create Your Project Directory

```bash
mkdir my-dashboard
cd my-dashboard
```

### 2. Use This Prompt with Claude Code

Copy this prompt and paste it into Claude Code or similar AI Agent:

!!! example "Dashboard Generation Prompt"
    ```
    Create a Visivo dashboard from my data located here: [YOUR DATA HERE].
    
    Requirements:
    - Use DuckDB as the data source
    - Load data from either:
      * A CSV file I provide above, OR
      * This sample retail dataset: https://raw.githubusercontent.com/visivo-io/visivo/main/mkdocs/assets/us_land_use.csv
    - Analyze the data and create at least 3 different charts showing different insights
    - Read the docs at docs.visivo.io to know how Visivo works and create a project.visivo.yml
    - Validate the visivo configuration with `visivo run`.
    - If the data is a csv use Visivo's [CSVFileSource](https://docs.visivo.io/reference/configuration/Sources/CSVFileSource/) to load that data. 
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

!!! success "Why Agent AI Works Better"
    AI Agents like Claude Code can read files, run commands, and iterate on solutions. This approach lets you:
    
    - Start with a working example tailored to your needs
    - Test and validate configurations automatically
    - Iterate quickly through conversation and feedback
    - Learn Visivo's syntax through guided exploration


Now jump to [Experience Live Development](#experience-live-development) to start customizing!

---

## Experience Live Development

Once your dashboard is running (from either path), experience the magic of hot-reload. This is especially powerful when combined with Agent AI iteration:

### The Development Cycle

1. **:material-file-edit: Edit** - Open `project.visivo.yml` in your editor and make any change:
   
   ```yaml
   charts:
     - name: revenue_chart
       layout:
         title: Monthly Revenue  # ← Change this
   ```

2. **:material-content-save: Save** - Save the file (Cmd+S / Ctrl+S). That's it! No build command needed.

3. **:material-eye: See** - Your dashboard updates instantly in the browser.
   - ✅ No compilation
   - ✅ No build step  
   - ✅ No page refresh

<figure markdown>
  ![Live reload demonstration](assets/interactivity-example.gif)
  <figcaption>Every save triggers an instant update. Watch your dashboard evolve in real-time!</figcaption>
</figure>

### Why This Matters

This instant feedback loop revolutionizes dashboard development:

- **Experiment Freely** - Try different visualizations instantly
- **Learn Faster** - See the impact of each change immediately  
- **Debug Visually** - Spot issues as they happen
- **Iterate Quickly** - From idea to implementation in seconds

!!! tip "Pro Tip: Split Screen Development"
    Open your editor and browser side-by-side. As you type and save, watch your dashboard transform in real-time. It's like having a conversation with your data!

---

## What's Next?

Now that you have a running dashboard, explore what's possible:

<div class="grid cards" markdown>

-   :material-palette:{ .lg .middle } **Customize Your Dashboard**

    ---

    Learn how to modify layouts, colors, and styling
    
    [:octicons-arrow-right-24: Dashboard customization](reference/configuration/Dashboards/Dashboard/index.md)

-   :material-chart-line:{ .lg .middle } **Add Charts & Visualizations**

    ---

    Explore 40+ chart types with rich customization options
    
    [:octicons-arrow-right-24: Chart gallery](reference/configuration/Chart/index.md)

-   :material-database:{ .lg .middle } **Connect Your Data**

    ---

    Set up connections to your production databases
    
    [:octicons-arrow-right-24: Data sources](topics/sources.md)

-   :material-cloud-upload:{ .lg .middle } **Deploy & Share**

    ---

    Share your dashboards with your team
    
    [:octicons-arrow-right-24: Deployment guide](topics/deployments.md)

-   :material-github:{ .lg .middle } **Examples**

    ---

    Explore real-world examples and templates
    
    [:octicons-arrow-right-24: View examples](https://visivo.io/examples)

</div>

---

**Questions?** [Contact us](mailto:jared@visivo.io) - we're here to help!

---

!!! quote "Why Visivo?"
    "Unlike other tools that require complex setup and configuration, Visivo gets you from zero to dashboard in 90 seconds. Whether you're using our interactive wizard or AI assistance, you'll have a working dashboard before your coffee gets cold."

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="https://github.com/visivo/visivo" class="md-button md-button--primary">
    :octicons-star-16: Star us on GitHub
  </a>
  <a href="https://app.visivo.io" class="md-button">
    :material-cloud: Try Visivo Cloud
  </a>
</div>