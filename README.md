<p align="center">
  <img src="viewer/src/images/logo.png" alt="Visivo" width="300" />
</p>

<h1 align="center">AI native business intelligence. Build visually, in code+cli or through ai tools.</h1>

<p align="center">
  <a href="https://visivo.io">Website</a> •
  <a href="https://docs.visivo.io">Documentation</a> •
  <a href="https://visivo.io/examples">Live Examples</a> •
  <a href="https://join.slack.com/t/visivo-community/shared_invite/zt-38shh3jmq-1Vl3YkxHlGpD~GlalfiKsQ">Join Slack</a> •
  <a href="https://www.linkedin.com/company/visivo-io">LinkedIn</a>
</p>

<p align="center">
  <img src="https://img.shields.io/pypi/v/visivo?label=pypi%20package" alt="PyPI Version" />
  <img src="https://img.shields.io/pypi/dm/visivo" alt="PyPI Downloads" />
  <img src="https://img.shields.io/github/license/visivo-io/visivo" alt="License" />
  <img src="https://img.shields.io/github/stars/visivo-io/visivo?style=social" alt="GitHub Stars" />
</p>


## 🚀 Why Visivo?

Build reliable, testable dashboards that your team will actually trust. Here's what makes Visivo different:

- ✅ **Code-First Dashboard Development** – Define everything in YAML files, enabling version control, code reviews, and CI/CD for your analytics
- ✅ **Built-in Testing Framework** – Write Python tests for your data visualizations. Never ship broken charts to production again
- ✅ **50+ Interactive Chart Types** – From basic bar charts to advanced 3D visualizations and geospatial maps, powered by Plotly.js
- ✅ **Multi-Source Data Integration** – Join data from PostgreSQL, Snowflake, BigQuery, MySQL, SQLite, DuckDB, CSV, and Excel in a single dashboard
- ✅ **Local Development with Hot Reload** – See changes instantly with `visivo serve`. No more waiting for deployments to test changes
- ✅ **dbt Integration** – Reference your dbt models directly in visualizations. Your analytics stack, unified
- ✅ **Jinja2 Templates & Macros** – Use loops and variables to generate dynamic configurations. Write once, use everywhere
- ✅ **Interactive Components** – Add filters, selectors, and drill-downs without losing the benefits of code-based configuration
- ✅ **Push-Based Security** – You control data flow. No need to share database credentials with another SaaS tool
- ✅ **Single Binary Installation** – One executable, no Python required. Deploy anywhere from your laptop to production servers

## 📊 See Visivo in Action

<p align="center">
  <a href="https://www.youtube.com/watch?v=EXnw-m1G4Vc">
    <img src="https://img.youtube.com/vi/EXnw-m1G4Vc/maxresdefault.jpg" alt="Visivo Demo Video" width="60%" />
  </a>
</p>

<p align="center">
  <em>🎥 <strong><a href="https://www.youtube.com/watch?v=EXnw-m1G4Vc">Watch the Demo Video</a></strong> – See how to build dashboards with Visivo in just a few minutes</em>
</p>

<p align="center">
  <em>Build dashboards that are beautiful, interactive, and maintainable. <a href="https://visivo.io/examples">View more examples →</a></em>
</p>

## 🎯 Getting Started

Get your first dashboard running in under 5 minutes:

### Quick Install

```bash
# Install Visivo (works on Mac, Linux, and Windows)
curl -fsSL https://visivo.sh | bash

# Create your first project
visivo init my-dashboard

# Start the development server
cd my-dashboard && visivo serve

# Open http://localhost:8000 in your browser 🎉
```

### Alternative: UI-Guided Setup

Prefer a visual approach? Start the server and let Visivo guide you:

```bash
# Install and start in one go
curl -fsSL https://visivo.sh | bash
visivo serve --project-dir my-dashboard

# Follow the setup wizard in your browser at http://localhost:8000
```

### Other Installation Options

<details>
<summary>Install via pip</summary>

```bash
pip install visivo
```

</details>

<details>
<summary>Install specific version</summary>

```bash
# Install version 1.0.64
curl -fsSL https://visivo.sh | bash -s -- --version 1.0.64

# Or install beta version via pip
python -m pip install git+https://github.com/visivo-io/visivo.git@v1.1.0-beta-1
```

</details>

## 💬 Community & Support

<p align="center">
  <strong>Join our growing community of data practitioners!</strong>
</p>

- 💬 **[Join our Slack](https://join.slack.com/t/visivo-community/shared_invite/zt-38shh3jmq-1Vl3YkxHlGpD~GlalfiKsQ)** – Get help, share dashboards, and chat with the team
- 📚 **[Browse Documentation](https://docs.visivo.io)** – Comprehensive guides and API reference
- 🐛 **[Report Issues](https://github.com/visivo-io/visivo/issues)** – Found a bug or have a feature request? Let us know!
- 💼 **[Follow on LinkedIn](https://www.linkedin.com/company/visivo-io)** – Stay updated with the latest news
- 📧 **[Email Us](mailto:info@visivo.io)** – For partnership or enterprise inquiries

## 🛠️ Contributing

We welcome contributions! Whether it's fixing bugs, adding features, or improving documentation, we'd love your help.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## 📈 Telemetry

Visivo collects anonymous usage data to help improve the product. No personal information, queries, or sensitive data is collected.

To opt out: set `VISIVO_TELEMETRY_DISABLED=true` or add `telemetry_enabled: false` to your config. [Learn more →](TELEMETRY.md)

## 🏢 About

Built with ❤️ by [Visivo](https://visivo.io/) – a team that's experienced scaling analytics at companies like Intuit, Boeing, and Root Insurance.

We believe data tools should be as reliable as the rest of your tech stack. That's why we built Visivo to bring software engineering best practices to business intelligence.

---

<p align="center">
  <sub>⭐ Star us on GitHub to support the project!</sub>
</p>