# Quick Start

## 🚀 Data to Dashboard in 90 Seconds

Transform your data into interactive dashboards with a single command. No configuration files, no complex setup—just instant visualization.

### 1. Install Visivo

```bash
curl -fsSL https://visivo.sh | bash
```

!!! success "One command, all platforms"
    Our installation script handles macOS, Linux, and Windows automatically. If you have an unsupported environment, check out our [pip installation guide](installation.md#python-package-pip).

### 2. Start the Local Server

```bash
visivo serve
```

This single command gives you a complete environment in seconds!

### 3. Choose an Example

Visivo will prompt you to select from several example dashboards, then:

- Initialize the chosen example into your current directory
- Create a complete `project.visivo.yml` configuration file
- Load sample data and refresh your browser to show the new configuration

Each example includes:
- Pre-configured sample data
- Multiple chart types to explore
- Interactive filters and controls
- A complete configuration to learn from

### 4. Make It Your Own

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

## Alternative: AI-Powered Development

**Want a more conversational approach?** Try using AI agents like Claude Code to build your dashboard through natural language. AI can analyze your data, suggest visualizations, and write the complete configuration for you.

[:material-robot: Explore AI-powered dashboard creation](ai-usage.md){ .md-button }

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