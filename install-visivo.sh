#!/bin/bash
set -e

# Define variables
VISIVO_DIR="$HOME/.visivo"
VISIVO_BIN_DIR="$VISIVO_DIR/bin"
REPO="visivo-io/visivo" # Please confirm this is the correct repository
PROFILE_UPDATED=0

# Clean up on exit
cleanup() {
  if [ -f "$VISIVO_DIR/visivo.zip" ]; then
    rm "$VISIVO_DIR/visivo.zip"
  fi
}
trap cleanup EXIT

main() {
  echo "Welcome to the Visivo installer!"

  # Detect OS
  OS="$(uname -s)"
  case "$OS" in
    Linux*)   PLATFORM=linux;;
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
  LATEST_RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"

  echo "Finding latest release from ${REPO}..."
  DOWNLOAD_URL=$(curl -sSL "$LATEST_RELEASE_URL" | grep "browser_download_url" | grep "$ASSET_NAME" | sed -E 's/.*"browser_download_url": "([^"]+)".*/\1/')

  if [ -z "$DOWNLOAD_URL" ]; then
    echo "Error: Could not find the download URL for the latest release." >&2
    echo "Please check https://github.com/${REPO}/releases for available assets." >&2
    exit 1
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

main 