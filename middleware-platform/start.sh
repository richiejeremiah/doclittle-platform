#!/bin/bash

# Load NVM (Node Version Manager)
export NVM_DIR="$HOME/.nvm"
[ -s "$(brew --prefix nvm)/nvm.sh" ] && \. "$(brew --prefix nvm)/nvm.sh"

# Navigate to middleware directory
cd "$(dirname "$0")"

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found!"
    echo "Please install Node.js:"
    echo "  1. Install nvm: brew install nvm"
    echo "  2. Install node: nvm install node"
    echo "  3. Run this script again"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found!"
    echo "Please install Node.js (npm comes with it)"
    exit 1
fi

echo "✅ Node version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Start the server
echo "🚀 Starting middleware server..."
npm start
