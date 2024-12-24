URL="http://127.0.0.1:8000"

INTERVAL=5

check_connection() {
    curl --head --silent --fail "$URL" > /dev/null
    return $?
}

while true; do
    if check_connection; then
        echo "Connection to $URL is live!"
        exit 0
    else
        sleep $INTERVAL
    fi
done