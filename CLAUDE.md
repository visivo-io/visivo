# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Python CLI Development
- **Install dependencies**: `poetry install`
- **Run tests**: `poetry run pytest`
- **Format code**: `poetry run black .` (line length: 100)
- **Install package locally**: `pip install -e .`
- **Run CLI**: `visivo [command]`

### JavaScript Viewer Development
- **Install dependencies**: `yarn install` (in `viewer/` directory)
- **Run tests**: `yarn test`
- **Start development server**: `yarn start` (proxies to localhost:8000)
- **Build for production**: `yarn build`
- **Lint**: `yarn lint`
- **Format**: `yarn format`

### Combined Development
- **Deploy viewer to CLI**: `yarn deploy` (builds both local and dist versions)
- **Build viewer for local dev**: `yarn deploy:local`
- **Build viewer for distribution**: `yarn deploy:dist`

### Documentation (MkDocs)
- **Generate configuration docs**: `python mkdocs/src/write_mkdocs_markdown_files.py`
- **Build docs locally**: `mkdocs build`
- **Serve docs locally**: `mkdocs serve`
- **Deploy docs**: `./deploy_mkdocs` (builds and deploys to GitHub Pages)
- **Validate docs build**: `./validate_mkdocs_build.sh`

## Architecture Overview

Visivo is a data visualization tool with two main components:

### 1. Python CLI (`visivo/` directory)
- **Entry point**: `command_line.py` - Click-based CLI with commands like `init`, `serve`, `compile`, `run`, `test`
- **Core model**: `models/project.py` - Central Project model that defines the entire configuration structure
- **Parser system**: `parsers/core_parser.py` - Parses YAML configuration files into Pydantic models
- **Data models**: Extensive model hierarchy in `models/` including:
  - Sources (BigQuery, DuckDB, MySQL, PostgreSQL, Snowflake, SQLite)
  - Models (SQL, CSV script, local merge)
  - Traces, Charts, Dashboards, Tables
  - Alerts and Destinations
- **Server**: `server/flask_app.py` - Flask app that serves the web interface and API
- **Job system**: `jobs/` - DAG-based job runner for executing data transformations
- **Query engine**: `query/` - SQL query building and execution

### 2. JavaScript Viewer (`viewer/` directory)
- **Framework**: React with Vite build system
- **State management**: Zustand stores in `src/stores/`
- **Visualization**: Plotly.js for charts and graphs
- **UI components**: Material-UI and custom components
- **API layer**: `src/api/` - Interfaces with Flask backend
- **Routing**: React Router with separate Local and Dist modes

### Key Architectural Patterns

1. **Configuration-as-Code**: Everything is defined in YAML files (`.visivo.yml`)
2. **DAG-based execution**: All components form a directed acyclic graph for dependency resolution
3. **Pydantic models**: Strong typing throughout the Python codebase
4. **Plugin architecture**: Extensible source and destination connectors
5. **Dual deployment**: Local development mode vs distribution mode

## Project Structure

- `visivo/` - Python CLI source code
- `viewer/` - React web application
- `tests/` - Python test suite
- `test-projects/` - Example projects for testing
- `mkdocs/` - Documentation source
- `schema/` - JSON schemas for trace properties

## Development Workflow

1. **Python changes**: Edit in `visivo/`, test with `poetry run pytest`, install with `pip install -e .`
2. **Viewer changes**: Edit in `viewer/src/`, test with `yarn test`, run with `yarn start`
3. **Integration**: Use `yarn deploy` to build viewer into CLI package
4. **Testing**: Use projects in `test-projects/` for end-to-end testing

## Key Configuration Files

- `pyproject.toml` - Python dependencies and build configuration
- `viewer/package.json` - JavaScript dependencies and scripts
- `pytest.ini` - Test configuration
- `mkdocs.yml` - Documentation configuration

## Documentation System (MkDocs)

Visivo uses MkDocs with Material theme for documentation generation. The system has several key components:

### Auto-Generated Configuration Documentation
- **Source**: Pydantic models in `visivo/models/` with docstrings
- **Generator**: `mkdocs/src/write_mkdocs_markdown_files.py` - Dynamically generates markdown files from model schemas
- **Parser**: `visivo/parsers/mkdocs.py` - Processes Pydantic models and generates navigation structure
- **Schema**: Uses `visivo/parsers/schema_generator.py` to create JSON schema from models

### MkDocs Configuration
- **Main config**: `mkdocs.yml` - Material theme with custom branding, navigation, and plugins
- **Plugins**: Includes spellcheck, video, autolinks, macros, and include-markdown
- **Theme**: Material theme with custom colors (`mkdocs/stylesheets/brand_colors.css`)
- **Source directory**: `mkdocs/` contains all documentation content
- **Build directory**: `mkdocs_build/` (generated)

### Content Structure
- **Manual pages**: `mkdocs/index.md`, `mkdocs/topics/`, `mkdocs/background/`
- **Auto-generated**: `mkdocs/reference/configuration/` - Created from Pydantic models
- **CLI docs**: `mkdocs/reference/cli.md` - Generated from Click commands using mkdocs-click
- **Functions**: `mkdocs/reference/functions/` - Runtime and Jinja function documentation

### Documentation Workflow
1. **Model changes**: Update Pydantic models with proper docstrings
2. **Regenerate**: Run `python mkdocs/src/write_mkdocs_markdown_files.py` to update config docs
3. **Build**: Use `mkdocs build` to generate static site
4. **Deploy**: Use `./deploy_mkdocs` to build and deploy to GitHub Pages via `mkdocs gh-deploy`

### Key Features
- **Automatic navigation**: Navigation structure generated from model hierarchy
- **Cross-references**: Links between related configuration objects
- **Spellcheck**: Validates content against `mkdocs/known_words.txt`
- **Custom macros**: `mkdocs/src/main.py` provides custom Jinja macros
- **Trace props**: Special handling for Plotly trace properties documentation

## Common Tasks

- **New feature development**: Usually requires changes to both Python models and React components
- **Adding data sources**: Extend `models/sources/` and update parsing logic
- **UI changes**: Focus on `viewer/src/components/` and related stores
- **Testing**: Python tests in `tests/`, JavaScript tests alongside components
- **Documentation updates**: 
  - For configuration: Update model docstrings, then regenerate with `python mkdocs/src/write_mkdocs_markdown_files.py`
  - For topics/guides: Edit files in `mkdocs/topics/` or `mkdocs/background/`
  - For CLI: Update Click command help text, docs auto-generate