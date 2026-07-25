#!/bin/bash

set -e  # Exit on any error

echo "=========================================="
echo "   Funbox Repository Setup & Host Script  "
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        OS="windows"
    else
        OS="unknown"
    fi
    echo "$OS"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Node.js and npm if not present
install_nodejs() {
    if ! command_exists node; then
        print_warning "Node.js not found. Installing..."
        
        OS=$(detect_os)
        
        case "$OS" in
            linux)
                # Ubuntu/Debian
                if command_exists apt-get; then
                    sudo apt-get update
                    sudo apt-get install -y nodejs npm
                # Fedora/RHEL/CentOS
                elif command_exists dnf; then
                    sudo dnf install -y nodejs npm
                # Alpine
                elif command_exists apk; then
                    sudo apk add nodejs npm
                # Arch
                elif command_exists pacman; then
                    sudo pacman -S nodejs npm
                else
                    print_error "Could not detect package manager. Please install Node.js manually."
                    exit 1
                fi
                ;;
            macos)
                if command_exists brew; then
                    brew install node
                else
                    print_error "Homebrew not found. Please install Homebrew first: https://brew.sh"
                    exit 1
                fi
                ;;
            windows)
                print_error "Windows detected. Please install Node.js manually from https://nodejs.org/"
                exit 1
                ;;
            *)
                print_error "Unknown OS. Please install Node.js manually."
                exit 1
                ;;
        esac
    else
        print_status "Node.js already installed: $(node --version)"
        print_status "npm already installed: $(npm --version)"
    fi
}

# Install dependencies using npm
install_dependencies() {
    print_status "Installing npm dependencies..."
    npm install
    
    if [ $? -eq 0 ]; then
        print_status "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
}

# Build the project
build_project() {
    print_status "Building the project..."
    npm run build
    
    if [ $? -eq 0 ]; then
        print_status "Project built successfully"
    else
        print_error "Failed to build project"
        exit 1
    fi
}

# Start the development server
start_dev_server() {
    echo ""
    print_status "Starting development server..."
    echo ""
    echo "=========================================="
    echo "   Development Server Running            "
    echo "=========================================="
    echo ""
    npm run dev
}

# Main execution
main() {
    # Get the repository root directory
    REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$REPO_DIR"
    
    print_status "Repository directory: $REPO_DIR"
    echo ""
    
    # Step 1: Detect OS
    print_status "Detecting operating system..."
    OS=$(detect_os)
    print_status "OS detected: $OS"
    echo ""
    
    # Step 2: Install Node.js if needed
    print_status "Checking Node.js installation..."
    install_nodejs
    echo ""
    
    # Step 3: Install dependencies
    install_dependencies
    echo ""
    
    # Step 4: Build the project
    build_project
    echo ""
    
    # Step 5: Start development server
    print_status "Setup complete! Starting development server..."
    echo ""
    start_dev_server
}

# Run main function
main "$@"
