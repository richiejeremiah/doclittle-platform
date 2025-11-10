#!/bin/bash

# Local Development Startup Script
# Starts the backend server and provides instructions for tunnel setup

echo "🚀 Starting DocLittle Backend (Local Development)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if we're in the right directory
if [ ! -f "middleware-platform/server.js" ]; then
  echo "❌ Error: Please run this script from the project root directory"
  exit 1
fi

# Load nvm if available (Node.js might be installed via nvm)
export NVM_DIR="$HOME/.nvm"
if [ -s "$(brew --prefix nvm)/nvm.sh" ]; then
  \. "$(brew --prefix nvm)/nvm.sh"
elif [ -s "$NVM_DIR/nvm.sh" ]; then
  \. "$NVM_DIR/nvm.sh"
fi

# Check if Node.js is installed (after loading nvm)
if ! command -v node &> /dev/null; then
  echo "❌ Error: Node.js is not installed"
  echo "   Install from: https://nodejs.org/"
  echo "   Or use nvm: nvm install node"
  exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if dependencies are installed
if [ ! -d "middleware-platform/node_modules" ]; then
  echo "📦 Installing dependencies..."
  cd middleware-platform
  npm install
  cd ..
fi

# Check for .env file
if [ ! -f "middleware-platform/.env" ]; then
  echo "⚠️  Warning: .env file not found"
  echo "   Create middleware-platform/.env with your environment variables"
  echo "   See: docs/setup/ENV_SETUP.md"
fi

echo ""
echo "✅ Starting server on http://localhost:4000"
echo ""
echo "📋 Next Steps:"
echo "   1. In a NEW terminal, start a tunnel:"
echo "      - Cloudflare: cloudflared tunnel --url http://localhost:4000"
echo "      - ngrok:      ngrok http 4000"
echo "      - localtunnel: lt --port 4000"
echo ""
echo "   2. Copy the tunnel URL (e.g., https://abc123.trycloudflare.com)"
echo ""
echo "   3. Update Retell/Twilio webhooks:"
echo "      - Retell LLM WebSocket: wss://your-tunnel-url.com/webhook/retell/llm"
echo "      - Twilio Voice Webhook: https://your-tunnel-url.com/voice/incoming"
echo ""
echo "   4. Or run: API_BASE_URL=https://your-tunnel-url.com node middleware-platform/configure-retell.js"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the server
cd middleware-platform
npm start

