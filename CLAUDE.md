# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Python CLI Development
- **Install dependencies**: `poetry install`
- **Run tests**: `poetry run pytest`
- **Format code**: `poetry run black .` (line length: 100)
- **Install package locally**: `pip install -e .`
- **Run CLI**: `visivo [command]`
- **Ensure python file formatting**: ensure that all python files are formatted in accordance with our black settings

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
- **Generate configuration docs**: `poetry run python mkdocs/src/write_mkdocs_markdown_files.py`
- **Build docs locally**: `poetry run mkdocs build`
- **Serve docs locally**: `poetry run mkdocs serve`
- **Deploy docs**: `poetry run ./deploy_mkdocs` (builds and deploys to GitHub Pages)
- **Validate docs build**: `poetry run ./validate_mkdocs_build.sh`

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

#### CLI Command Structure
Each CLI command follows a consistent pattern:
- `commands/{command}.py` - Click command definition with options/arguments
- `commands/{command}_phase.py` - Implementation logic for the command

**Key Commands**:
- `compile` - Parses project files and generates artifacts (project.json, explorer.json)
- `run` - Executes trace queries and generates data files via DAG runner
- `serve` - Starts Flask server with hot reload for development
- `test` - Compiles project and runs test assertions

#### Execution Flow
1. **Compile Phase**: YAML parsing → Pydantic models → JSON artifacts
2. **Run Phase**: Project loading → DAG execution → Trace query execution → Data file generation
3. **Serve Phase**: Run phase + Flask server + file watching + hot reload

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

## Source Introspection Architecture

### When Introspection Happens (Server Only)
Source introspection is **only** performed by the Flask server, never during CLI execution:

- **Server API**: `/api/project/sources_metadata` endpoint in `server/flask_app.py`
- **Implementation**: `server/source_metadata.py` → `gather_source_metadata()` → `source.introspect()`
- **Base class**: `SqlalchemySource.introspect()` uses SQLAlchemy Inspector to discover schemas/tables/columns
- **UI integration**: React Explorer component fetches metadata on-demand when needed

### When Introspection Does NOT Happen (CLI Commands)
The CLI execution path is introspection-free to maintain performance:

- **Run phase**: Only executes trace queries and generates data files
- **Compile phase**: Only parses YAML and generates artifacts
- **Source connection tests**: Use minimal "SELECT 1" queries for connectivity validation
- **Model execution**: CsvScriptModel and LocalMergeModel never introspect sources

### Key Design Principles
1. **Lazy Loading**: Introspection only when requested by UI
2. **Separation of Concerns**: Data generation (CLI) vs metadata discovery (server)
3. **Performance**: Execution path remains fast without expensive schema operations
4. **Error Isolation**: Introspection failures don't break core functionality

## Important Product Clarifications

### Architecture Philosophy
- **NOT Real-Time**: Visivo uses a push-based architecture, NOT real-time data access
- **Batch Processing**: Inherently batch-based system - we don't need to access your database continuously
- **Future Plans**: Pull functionality in is planned for cloud in the future but not currently available

### Model Definition
- **SQL Models**: Models are defined inline in YAML using `sql:` only. There's no support for direct .sql files at this time.
- **No Direct .sql Files**: Creating standalone .sql files only works with dbt integration (must run dbt before visivo)
- **Model Types**: SQL models, CSV script models, and local merge models

### Documentation Best Practices
- **Use DuckDB for Examples**: Prefer DuckDB over SQLite for documentation examples
- **Provide Sample Data**: Create downloadable DuckDB databases in assets/ for tutorials
- **Test All Examples**: Ensure all code examples actually work with Visivo
- **De-emphasize Testing**: Testing features are not mature - don't focus heavily on them

### Preferred Database for Examples
- **DuckDB**: Default choice for examples and tutorials
- **Sample Databases**: Provide pre-built DuckDB files users can download
- **Connection String**: Use `type: duckdb` with `database: path/to/file.duckdb`

## Common Tasks

- **New feature development**: Usually requires changes to both Python models and React components
- **Adding data sources**: Extend `models/sources/` and update parsing logic
- **UI changes**: Focus on `viewer/src/components/` and related stores
- **Testing**: Python tests in `tests/`, JavaScript tests alongside components
- **Documentation updates**: 
  - For configuration: Update model docstrings, then regenerate with `python mkdocs/src/write_mkdocs_markdown_files.py`
  - For topics/guides: Edit files in `mkdocs/topics/` or `mkdocs/background/`
  - For CLI: Update Click command help text, docs auto-generate