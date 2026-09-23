#!/bin/bash

# ReliabilityNet Startup Script

echo "========================================================"
echo " Starting ReliabilityNet Services with RoBERTa Model "
echo "========================================================"

# Kill any running instances on ports 3131, 4000, 5001, 5173
lsof -ti:3131 | xargs kill -9 2>/dev/null
lsof -ti:4000 | xargs kill -9 2>/dev/null
lsof -ti:5001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# 1. Start Proxy Server (Port 3131)
echo "1. Starting Proxy Server on http://localhost:3131..."
node proxy-server.js &
PROXY_PID=$!

# 2. Start Auth / Save Server if available (Port 4000)
if [ -d "server" ]; then
  echo "2. Starting Auth/DB Server on http://localhost:4000..."
  (cd server && npm start) &
  SERVER_PID=$!
fi

# 3. Start Python Model Server (Port 5001)
if [ -f "./model_env/bin/python" ]; then
  echo "3. Starting Model Server on http://localhost:5001..."
  ./model_env/bin/python model_server.py &
  MODEL_SERVER_PID=$!
else
  echo "3. Starting Model Server using system python3..."
  python3 model_server.py &
  MODEL_SERVER_PID=$!
fi

# 4. Start Vite Frontend (Port 5173)
echo "4. Starting Vite Frontend..."
node node_modules/vite/bin/vite.js

# Cleanup on exit
trap "kill $PROXY_PID $SERVER_PID $MODEL_SERVER_PID 2>/dev/null" EXIT
