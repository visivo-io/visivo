# Installation

Visivo offers multiple installation methods to suit different needs and environments.

## Quick Install (Recommended)

The fastest way to get started with Visivo is using our installation script:

=== "macOS/Linux/Windows (WSL)"

    ```bash
    curl -fsSL https://visivo.sh | bash
    ```

=== "Windows (PowerShell)"

    ```powershell
    irm https://visivo.sh/install.ps1 | iex
    ```

!!! success "What you get"
    - ✅ Single binary, no dependencies
    - ✅ Works on Mac, Linux, and Windows
    - ✅ Automatic updates available
    - ✅ Instant hot-reload development

## Python Package (pip)

Best for Python developers and data scientists who want to integrate Visivo into existing workflows.

### Requirements
- Python 3.10 or higher
- Virtual environment recommended

### Standard Installation

```bash
pip install visivo
```

### Development Installation

For contributors or those who want the latest development features:

```bash
# Clone the repository
git clone https://github.com/visivo-io/visivo.git
cd visivo

# Install in development mode
pip install -e .
```

!!! tip "Virtual Environment"
    We strongly recommend using a virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install visivo
    ```

### Verify Installation

```bash
visivo --version
```

## Building from Source

For developers who want to contribute or customize Visivo:

### Prerequisites
- Python 3.10+
- Node.js 16+ (for frontend development)
- Git

### Build Steps

```bash
# Clone the repository
git clone https://github.com/visivo-io/visivo.git
cd visivo

# Install Python dependencies
pip install -e .

# Install and build frontend (optional)
cd viewer
npm install
npm run build
cd ..

# Run development server
visivo serve
```

## Platform-Specific Notes

### macOS
- Requires macOS 10.15 or later
- Apple Silicon (M1/M2) fully supported

### Linux
- Tested on Ubuntu 20.04+, Debian 10+, RHEL 8+, Alpine
- Requires glibc 2.31+ for binary distribution

### Windows
- Windows 10/11 recommended
- PowerShell 5.1+ required for install script
- WSL2 recommended for best experience

## Environment Variables

Visivo respects standard environment variables:

```bash
# Set custom port
export VISIVO_PORT=3000

# Set custom host
export VISIVO_HOST=0.0.0.0

# Enable debug logging
export VISIVO_LOG_LEVEL=DEBUG
```

## Troubleshooting

### Permission Denied

If you get a permission error during installation:

```bash
# macOS/Linux
sudo curl -fsSL https://visivo.sh | bash

# Or install to user directory
curl -fsSL https://visivo.sh | bash -s -- --prefix=$HOME/.local
```

### Python Version Issues

If you have multiple Python versions:

```bash
# Specify Python version
python3.10 -m pip install visivo

# Or use pyenv
pyenv install 3.10.0
pyenv local 3.10.0
pip install visivo
```

### Behind Corporate Proxy

```bash
# Set proxy environment variables
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Then install
pip install visivo
```

## Uninstallation

### Binary Installation

```bash
# Remove binary
rm /usr/local/bin/visivo

# Or if installed with --prefix
rm $HOME/.local/bin/visivo
```

### Python Package

```bash
pip uninstall visivo
```

## Next Steps

After installation, you're ready to create your first dashboard:

- [Quick Start Guide](index.md#quick-start) - Get your first dashboard running
- [Configuration Reference](reference/configuration/index.md) - Learn about project configuration
- [Examples](https://github.com/visivo-io/visivo/tree/main/examples) - Explore sample projects