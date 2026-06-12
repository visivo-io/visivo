# Installation

Visivo offers multiple installation methods to suit different needs and environments.

## Quick Install (Recommended)

The fastest way to get started with Visivo is using our installation script:

```bash
curl -fsSL https://visivo.sh | bash
```

The script installs the `visivo` binary to `~/.visivo/bin` and adds it to your `PATH`. On Windows, run it inside [WSL](https://learn.microsoft.com/en-us/windows/wsl/install), or use the [pip installation](#python-package-pip) instead.

!!! success "What you get"
    - ✅ Single binary, no dependencies
    - ✅ Works on Mac, Linux, and Windows (WSL)
    - ✅ No `sudo` required — installs to your home directory
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
- WSL2 recommended for the install script
- Native Windows users should install via [pip](#python-package-pip)

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

### Command Not Found After Install

The install script places the binary in `~/.visivo/bin` and appends that
directory to your shell profile. If `visivo` isn't found right after
installing, reload your shell:

```bash
# Restart your terminal, or:
source ~/.bashrc   # bash
source ~/.zshrc    # zsh

# Or add it to your PATH manually
export PATH="$HOME/.visivo/bin:$PATH"
```

### Installing a Specific Version

```bash
curl -fsSL https://visivo.sh | bash -s -- --version 2.0.3
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
# Remove the install directory
rm -rf ~/.visivo

# Then remove the PATH line the installer added to your
# shell profile (~/.bashrc, ~/.zshrc, or ~/.profile)
```

### Python Package

```bash
pip uninstall visivo
```

## Next Steps

After installation, you're ready to create your first dashboard:

- [Quick Start Guide](index.md#quick-start) - Get your first dashboard running