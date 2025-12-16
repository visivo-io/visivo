#!/bin/bash
# Initialize local development databases with test data
# Usage: ./scripts/init-local-databases.sh [postgres|mysql|clickhouse|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

init_postgres() {
    echo "Initializing PostgreSQL..."
    PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -f "$PROJECT_DIR/tests/setup/populate_ci_postgres.sql"
    echo "PostgreSQL initialized."
}

init_mysql() {
    echo "Initializing MySQL..."
    mysql --protocol tcp -h localhost -u root -pmysql < "$PROJECT_DIR/tests/setup/populate_ci_mysql.sql"
    echo "MySQL initialized."
}

init_clickhouse() {
    echo "Initializing ClickHouse..."
    docker exec -i visivo-clickhouse-1 clickhouse-client --user default --password clickhouse --multiquery < "$PROJECT_DIR/tests/setup/populate_ci_clickhouse.sql"
    echo "ClickHouse initialized."
}

case "${1:-all}" in
    postgres)
        init_postgres
        ;;
    mysql)
        init_mysql
        ;;
    clickhouse)
        init_clickhouse
        ;;
    all)
        init_postgres
        init_mysql
        init_clickhouse
        ;;
    *)
        echo "Usage: $0 [postgres|mysql|clickhouse|all]"
        exit 1
        ;;
esac

echo "Done!"
