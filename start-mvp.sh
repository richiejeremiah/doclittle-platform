#!/bin/bash

echo "🚀 STARTING MVP - AI COMMERCE PLATFORM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if all directories exist
if [ ! -d "middleware-platform" ]; then
    echo "❌ middleware-platform directory not found"
    exit 1
fi

if [ ! -d "merchant-shop" ]; then
    echo "❌ merchant-shop directory not found"
    exit 1
fi

if [ ! -d "unified-dashboard" ]; then
    echo "❌ unified-dashboard directory not found"
    exit 1
fi

# Kill any existing processes on these ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:4000 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null

echo "✅ Ports cleared"
echo ""

# Start services
echo "🏪 Starting Merchant Shop (port 3000)..."
cd merchant-shop
npm start > /dev/null 2>&1 &
MERCHANT_PID=$!
cd ..

sleep 2

echo "🛡️ Starting Middleware (port 4000)..."
cd middleware-platform
npm start > /dev/null 2>&1 &
MIDDLEWARE_PID=$!
cd ..

sleep 2

echo "📊 Starting Dashboard (port 8000)..."
cd unified-dashboard
python3 -m http.server 8000 > /dev/null 2>&1 &
DASHBOARD_PID=$!
cd ..

sleep 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL SERVICES RUNNING!"
echo ""
echo "📍 Services:"
echo "   🏪 Merchant Shop:  http://localhost:3000"
echo "   🛡️ Middleware:     http://localhost:4000"
echo "   📊 Dashboard:      http://localhost:8000"
echo ""
echo "🔑 Demo Login:"
echo "   Email:    owner@vitamins.com"
echo "   Password: demo123"
echo ""
echo "🎙️ Voice Agent:"
echo "   Call to test voice commerce flow"
echo ""
echo "⏹️  To stop all services:"
echo "   kill $MERCHANT_PID $MIDDLEWARE_PID $DASHBOARD_PID"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"