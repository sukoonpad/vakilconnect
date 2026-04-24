#!/bin/bash
# VakilConnect - One-click local setup for Mac/Linux

echo ""
echo "  ============================================================"
echo "       VakilConnect - India's #1 Legal Marketplace"
echo "       One-Click Local Setup"
echo "  ============================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js is not installed!"
    echo ""
    echo "  Install it from: https://nodejs.org/"
    echo "  Or on Mac:  brew install node"
    echo "  Or Ubuntu:  sudo apt install nodejs npm"
    exit 1
fi

echo "  [OK] Node.js $(node --version) is installed"
echo ""

cd "$(dirname "$0")/local-dev"

# Install deps
if [ ! -d "node_modules" ]; then
    echo "  [STEP 1/2] Installing dependencies (first time only)..."
    npm install
    echo ""
fi

echo "  [STEP 2/2] Starting server..."
echo ""

# Open browser after delay
if command -v open &> /dev/null; then
    (sleep 3 && open http://localhost:4000/app) &
elif command -v xdg-open &> /dev/null; then
    (sleep 3 && xdg-open http://localhost:4000/app) &
fi

node server.js
