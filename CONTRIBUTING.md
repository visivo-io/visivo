# Contributing to Visivo

Thank you for your interest in contributing to Visivo! We welcome contributions from the community and are grateful for any help you can provide.

## 🚀 Development Setup

Visivo consists of two main components:
1. **Python CLI** - The backend server and command-line interface
2. **React Viewer** - The frontend dashboard viewer

### Prerequisites

- Python 3.10+
- Node.js 20+
- Poetry (Python package manager)
- Yarn (JavaScript package manager)

## 🐍 CLI Development

The Python CLI is located in the `visivo` folder and uses Poetry for dependency management.

### Setup

```bash
# Install Poetry if you haven't already
pip install poetry

# Install dependencies
cd visivo
poetry install

# Install Visivo in development mode (links to your local files)
pip install -e .
```

### Common Commands

```bash
# Run tests
poetry run pytest

# Run specific test
poetry run pytest tests/telemetry/test_config.py -xvs

# Format code (line length: 100)
poetry run black .

# Start the server
visivo serve
```

### Testing Projects

Test your changes using the test projects:

```bash
cd test-projects/integration
timeout 30 DEBUG=true STACKTRACE=true visivo run
```

## 🎨 Viewer Development

The React viewer is located in the `viewer` folder and uses Yarn for dependency management.

### Setup

```bash
# Install Yarn if you haven't already
npm install -g yarn

# Install dependencies
cd viewer
yarn install
```

### Development Workflow

To develop the viewer, you need both the backend server and frontend running:

1. **Terminal 1 - Start the backend server:**
   ```bash
   # From the root directory, using any test project
   visivo serve --project-dir test-projects/simple
   ```

2. **Terminal 2 - Start the frontend dev server:**
   ```bash
   cd viewer
   yarn start
   ```

3. Navigate to http://localhost:3000 (the React dev server will proxy API requests to the backend on port 8000)

### Common Commands

```bash
# Run tests
yarn test

# Run linter
yarn lint

# Format code
yarn format

# Build for production
yarn build

# Deploy to CLI (builds both local and distribution versions)
yarn deploy

# Deploy specific version
yarn deploy:local   # Local version only
yarn deploy:dist    # Distribution version only
```

### Viewer Build Modes

The viewer has two build modes:
- **Local**: For development with hot reload support
- **Distribution**: Optimized for embedding in the CLI binary

## 📝 Documentation

Documentation is built using MkDocs and hosted on GitHub Pages.

### Setup

```bash
cd visivo

# Generate configuration docs from Pydantic models
python mkdocs/src/write_mkdocs_markdown_files.py

# Serve docs locally
mkdocs serve

# Build documentation
mkdocs build

# Deploy to GitHub Pages
./deploy_mkdocs

# Validate build (includes spell check)
./validate_mkdocs_build.sh
```

## 🚢 Release Process

Releases are created through GitHub Actions:

1. **Generate Schema JSON**:
   ```bash
   poetry run write-schema-json
   ```

2. **Copy Install Script**:
   ```bash
   poetry run copy-install-script
   ```

3. **Build Binary** (handled by CI):
   ```bash
   poetry run build
   ```

4. **Create Release**: Use the "Create Release" GitHub Action with version number (e.g., `1.3.4` without the `v` prefix)

## 🧪 Testing Guidelines

### Python Tests

- Use pytest for all Python tests
- Test configuration in `pytest.ini`
- Use fixtures with `factory-boy`
- Mock HTTP requests with `pytest-httpx`
- General mocking with `pytest-mock`

### JavaScript Tests

- Use Jest with React Testing Library
- Canvas mocking with `jest-canvas-mock`
- Follow ESLint configuration in the project

## 📋 Code Style

### Python
- Use Black formatter with 100 character line limit
- Configuration in `pyproject.toml`
- Run `poetry run black .` before committing

### JavaScript/TypeScript
- Use Prettier for formatting
- ESLint for linting
- Run `yarn format` and `yarn lint` before committing

## 🔄 Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and ensure they pass
5. Format your code
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to your fork (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 💡 Development Tips

- Set `DEBUG=true` for verbose output
- Set `STACKTRACE=true` for full error traces
- Check generated artifacts in `.visivo/` directory
- Use environment variables for testing different scenarios

## 🤝 Community Guidelines

- Be respectful and inclusive
- Follow the code of conduct
- Ask questions in our [Slack community](https://join.slack.com/t/visivo-community/shared_invite/zt-38shh3jmq-1Vl3YkxHlGpD~GlalfiKsQ)
- Report bugs with clear reproduction steps
- Suggest features with use cases

## 📞 Getting Help

- 💬 [Join our Slack](https://join.slack.com/t/visivo-community/shared_invite/zt-38shh3jmq-1Vl3YkxHlGpD~GlalfiKsQ) for real-time help
- 📚 Check the [documentation](https://docs.visivo.io)
- 🐛 Search [existing issues](https://github.com/visivo-io/visivo/issues) before creating new ones

Thank you for contributing to Visivo! 🎉