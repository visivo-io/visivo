#!/bin/bash
set -e

# Define variables
VISIVO_DIR="$HOME/.visivo"
VISIVO_BIN_DIR="$VISIVO_DIR/bin"
REPO="visivo-io/visivo" # Please confirm this is the correct repository
PROFILE_UPDATED=0
PROFILE_FILE=""
VERSION="" # Version to install (empty means latest)

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

Examples:
  $0                     # Install latest version
  $0 -v v1.0.64         # Install specific version v1.0.64
  $0 --version 1.0.64   # Install specific version 1.0.64 (v prefix optional)

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
        ;;
    Darwin*)  
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