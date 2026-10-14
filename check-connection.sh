#!/bin/bash

URL="http://127.0.0.1:8000"
MAX_RETRIES=12  # 1 minute total (5s * 12)
INTERVAL=5
RETRY_COUNT=0

check_connection() {
    if curl --head --silent --fail "$URL" > /dev/null; then
        echo "✅ Connection to $URL is live!"
        return 0
    else
        echo "⏳ Waiting for $URL to become available... (Attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
        return 1
    fi
}

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if check_connection; then
        exit 0
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            echo "❌ Failed to connect to $URL after $MAX_RETRIES attempts"
            exit 1
        fi
        sleep $INTERVAL
    fi
done