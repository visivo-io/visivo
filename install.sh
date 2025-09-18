#!/bin/bash
set -e

# Define variables
VISIVO_DIR="$HOME/.visivo"
VISIVO_BIN_DIR="$VISIVO_DIR/bin"
REPO="visivo-io/visivo" # Please confirm this is the correct repository
PROFILE_UPDATED=0
PROFILE_FILE=""
VERSION="" # Version to install (empty means latest)

# Tested Linux distributions - these are the distributions we actively test in CI/CD
TESTED_DISTROS=(
  "ubuntu:22.04"
  "ubuntu:20.04"
  "debian:12"
  "fedora:39"
  "centos:stream9"
  "alpine:3.19"
)

# Clean up on exit
cleanup() {
  if [ -f "$VISIVO_DIR/visivo.zip" ]; then
    rm "$VISIVO_DIR/visivo.zip"
  fi
}
trap cleanup EXIT

# Parse command line arguments
parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      -v|--version)
        VERSION="$2"
        shift 2
        ;;
      -h|--help)
        show_help
        exit 0
        ;;
      *)
        echo "Error: Unknown option '$1'" >&2
        show_help
        exit 1
        ;;
    esac
  done
}

# Show help message
show_help() {
  cat << EOF
Visivo Installation Script

Usage: $0 [OPTIONS]

Options:
  -v, --version VERSION   Install a specific version (e.g., v1.0.64, 1.0.64)
                         If not specified, installs the latest version
  -h, --help             Show this help message

Environment Variables:
  VISIVO_FORCE_INSTALL   Set to '1' to bypass distribution validation
                         Use this if your Linux distribution is not officially tested

Examples:
  $0                                    # Install latest version
  $0 -v v1.0.64                        # Install specific version v1.0.64
  $0 --version 1.0.64                  # Install specific version 1.0.64 (v prefix optional)
  VISIVO_FORCE_INSTALL=1 $0            # Force install on untested distribution

Tested Linux Distributions:
EOF

  for distro in "${TESTED_DISTROS[@]}"; do
    echo "  - $distro"
  done

  cat << EOF

For other distributions, installation may work but is not officially supported.
Report issues at: https://github.com/$REPO/issues

EOF
}

# Validate version format
validate_version() {
  local version="$1"

  # Remove 'v' prefix if present for validation
  local clean_version="${version#v}"

  # Check if version follows semantic versioning pattern (X.Y.Z)
  if [[ ! "$clean_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Invalid version format '$version'. Expected format: X.Y.Z (e.g., 1.0.64 or v1.0.64)" >&2
    echo "Use --help for more information." >&2
    exit 1
  fi
}

# Detect current Linux distribution
detect_distribution() {
  local distro_name=""
  local distro_version=""

  if [ -f /etc/os-release ]; then
    # Parse /etc/os-release for distribution info
    . /etc/os-release
    distro_name="$ID"
    distro_version="$VERSION_ID"
  elif [ -f /etc/lsb-release ]; then
    # Parse /etc/lsb-release for Ubuntu systems
    . /etc/lsb-release
    distro_name="$(echo "$DISTRIB_ID" | tr '[:upper:]' '[:lower:]')"
    distro_version="$DISTRIB_RELEASE"
  elif [ -f /etc/redhat-release ]; then
    # Parse /etc/redhat-release for RHEL/CentOS systems
    if grep -q "CentOS Stream" /etc/redhat-release; then
      distro_name="centos"
      distro_version="stream$(grep -o 'Stream [0-9]\+' /etc/redhat-release | grep -o '[0-9]\+')"
    elif grep -q "CentOS" /etc/redhat-release; then
      distro_name="centos"
      distro_version="$(grep -o '[0-9]\+' /etc/redhat-release | head -1)"
    elif grep -q "Red Hat" /etc/redhat-release; then
      distro_name="rhel"
      distro_version="$(grep -o '[0-9]\+\.[0-9]\+' /etc/redhat-release | head -1)"
    fi
  elif [ -f /etc/alpine-release ]; then
    # Alpine Linux
    distro_name="alpine"
    distro_version="$(cat /etc/alpine-release | cut -d'.' -f1,2)"
  else
    echo "Warning: Could not detect Linux distribution" >&2
    return 1
  fi

  echo "${distro_name}:${distro_version}"
}

# Validate distribution against tested distributions
validate_distribution() {
  local current_distro="$1"

  if [ -z "$current_distro" ]; then
    echo "Warning: Could not detect current distribution. Proceeding with installation..." >&2
    echo "If you encounter issues, please report them at: https://github.com/$REPO/issues" >&2
    return 0
  fi

  local distro_name="${current_distro%:*}"
  local distro_version="${current_distro#*:}"

  # Check if current distribution is in our tested list
  local is_tested=false
  local closest_match=""

  for tested in "${TESTED_DISTROS[@]}"; do
    local tested_name="${tested%:*}"
    local tested_version="${tested#*:}"

    if [ "$distro_name" = "$tested_name" ]; then
      if [ "$distro_version" = "$tested_version" ]; then
        # Exact match
        is_tested=true
        break
      else
        # Same distro family, different version
        closest_match="$tested"
      fi
    fi
  done

  if [ "$is_tested" = true ]; then
    echo "✅ Distribution $current_distro is officially tested and supported."
    return 0
  elif [ -n "$closest_match" ]; then
    echo "⚠️  Warning: Your distribution ($current_distro) is not exactly tested." >&2
    echo "   We test $closest_match, which may be compatible." >&2
    echo "   Installation will proceed, but if you encounter issues," >&2
    echo "   please report them at: https://github.com/$REPO/issues" >&2
    return 0
  else
    echo "❌ Error: Unsupported Linux distribution: $current_distro" >&2
    echo "" >&2
    echo "Visivo is currently tested and supported on the following distributions:" >&2
    for tested in "${TESTED_DISTROS[@]}"; do
      echo "  - $tested" >&2
    done
    echo "" >&2
    echo "Your distribution may still work, but it hasn't been tested." >&2
    echo "To proceed anyway, you can:" >&2
    echo "  1. Try installing on a tested distribution" >&2
    echo "  2. Report compatibility issues at: https://github.com/$REPO/issues" >&2
    echo "  3. Request support for your distribution" >&2
    echo "" >&2
    echo "To force installation (not recommended), set VISIVO_FORCE_INSTALL=1:" >&2
    echo "  VISIVO_FORCE_INSTALL=1 curl -fsSL https://visivo.sh | bash" >&2
    exit 1
  fi
}

main() {
  echo "Welcome to the Visivo installer!"

  if [ -n "$VERSION" ]; then
    echo "Installing version: $VERSION"
    validate_version "$VERSION"
  else
    echo "Installing latest version"
  fi

  # Detect OS
  OS="$(uname -s)"
  case "$OS" in
    Linux*)
        ARCH=$(uname -m)
        case "$ARCH" in
            x86_64|amd64) PLATFORM="linux-x86";;
            *) echo "Error: Unsupported Linux architecture '$ARCH'." >&2; exit 1;;
        esac

        # Validate Linux distribution unless force install is set
        if [ "$VISIVO_FORCE_INSTALL" != "1" ]; then
          echo "Checking Linux distribution compatibility..."
          CURRENT_DISTRO=$(detect_distribution)
          validate_distribution "$CURRENT_DISTRO"
        else
          echo "⚠️  Force installation enabled - skipping distribution validation"
        fi
        ;;
    Darwin*)
        # Check macOS version
        MACOS_VERSION=$(sw_vers -productVersion)
        if [[ ! "$MACOS_VERSION" =~ ^([0-9]+) ]] || [ "${BASH_REMATCH[1]}" -lt 15 ]; then
            echo "Error: macOS version $MACOS_VERSION is not supported. Requires macOS 15 or later." >&2
            exit 1
        fi
        PLATFORM=darwin-x86
        if [ "$(uname -m)" = "arm64" ]; then
            PLATFORM="darwin-arm64"
        fi
        ;;
    MINGW*|CYGWIN*|MSYS*) PLATFORM=windows-x86;;
    *)        echo "Error: Unsupported operating system '$OS'." >&2; exit 1;;
  esac
  echo "Detected Operating System: $PLATFORM"

  # Find download URL
  ASSET_NAME="visivo-${PLATFORM}.zip"
  
  if [ -n "$VERSION" ]; then
    # Install specific version
    # Ensure version has 'v' prefix for GitHub API
    if [[ "$VERSION" != v* ]]; then
      VERSION="v$VERSION"
    fi
    
    RELEASE_URL="https://api.github.com/repos/${REPO}/releases/tags/${VERSION}"
    echo "Finding release ${VERSION} from ${REPO}..."
    
    DOWNLOAD_URL=$(curl -sSL "$RELEASE_URL" | grep "browser_download_url" | grep "$ASSET_NAME" | sed -E 's/.*"browser_download_url": "([^"]+)".*/\1/')
    
    if [ -z "$DOWNLOAD_URL" ]; then
      echo "Error: Could not find version '$VERSION' or asset '$ASSET_NAME' for this version." >&2
      echo "This could mean:" >&2
      echo "  - Version '$VERSION' doesn't exist" >&2
      echo "  - The asset '$ASSET_NAME' is not available for this version" >&2
      echo "  - Your platform '$PLATFORM' is not supported for this version" >&2
      echo "" >&2
      echo "Please check https://github.com/${REPO}/releases/tag/${VERSION} for available assets." >&2
      echo "Or visit https://github.com/${REPO}/releases to see all available versions." >&2
      exit 1
    fi
  else
    # Install latest version
    LATEST_RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"
    echo "Finding latest release from ${REPO}..."
    
    DOWNLOAD_URL=$(curl -sSL "$LATEST_RELEASE_URL" | grep "browser_download_url" | grep "$ASSET_NAME" | sed -E 's/.*"browser_download_url": "([^"]+)".*/\1/')
    
    if [ -z "$DOWNLOAD_URL" ]; then
      echo "Error: Could not find the download URL for the latest release." >&2
      echo "Please check https://github.com/${REPO}/releases for available assets." >&2
      exit 1
    fi
  fi

  echo "Downloading from $DOWNLOAD_URL"

  # Create directories
  mkdir -p "$VISIVO_DIR"
  mkdir -p "$VISIVO_BIN_DIR"
  
  # Download and extract
  curl -# -L "$DOWNLOAD_URL" -o "$VISIVO_DIR/visivo.zip"

  echo "Extracting..."
  unzip -o "$VISIVO_DIR/visivo.zip" -d "$VISIVO_BIN_DIR"
  chmod +x "$VISIVO_BIN_DIR/visivo"

  # Add to PATH
  update_profile

  echo ""
  echo "Installation complete!"
  
  # Show installed version
  if [ -n "$VERSION" ]; then
    echo "Installed Visivo version: $VERSION"
  else
    echo "Installed latest Visivo version"
  fi
  
  if [ "$PROFILE_UPDATED" -eq 1 ]; then
    echo "We've updated your shell profile. Please restart your terminal or run the command below to start using visivo:"
    echo "  source \"$PROFILE_FILE\""
  fi
  echo "You can now use the 'visivo' command."
}

update_profile() {
  SHELL_NAME=$(basename "$SHELL")
  
  if [ "$SHELL_NAME" = "bash" ]; then
      if [ -f "$HOME/.bashrc" ]; then
          PROFILE_FILE="$HOME/.bashrc"
      else
          PROFILE_FILE="$HOME/.bash_profile"
      fi
  elif [ "$SHELL_NAME" = "zsh" ]; then
      PROFILE_FILE="$HOME/.zshrc"
  else
      PROFILE_FILE="$HOME/.profile"
  fi

  if [ ! -f "$PROFILE_FILE" ]; then
    touch "$PROFILE_FILE"
  fi

  PATH_STRING='export PATH="'$VISIVO_BIN_DIR':$PATH"'

  if ! grep -q "# Visivo" "$PROFILE_FILE"; then
      echo "Updating your $PROFILE_FILE"
      {
        echo ''
        echo '# Visivo'
        echo "$PATH_STRING"
      } >> "$PROFILE_FILE"
      PROFILE_UPDATED=1
  else
      echo "Visivo already configured in your profile."
  fi
}

# Parse command line arguments first
parse_args "$@"

main 