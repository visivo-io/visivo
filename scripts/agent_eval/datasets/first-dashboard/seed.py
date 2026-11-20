"""Build the fixtures for test-projects/agent-eval/first-dashboard.

Ten messy files. Each file has its original under ``data/uploads/<version>/``
and its imported table in its own DuckDB file under ``data/imports/``. This
layout assumes a versioned project-file import. The current upload
(``/api/source/upload/``) is different: it saves the file in the project
directory, overwrites it on a second upload, and does not reload a table that
exists. Three databases under ``data/databases/``
for the "connect a database" route: a small star schema, a warehouse with 60
tables of which most are noise, and a 3,000,000-row telemetry table.

    python scripts/agent_eval/datasets/first-dashboard/seed.py

Every file is seeded, so two builds are identical.
"""

import csv
import datetime as dt
import os
import random
import re
import shutil
import sys

import duckdb

ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
)
PROJECT = os.path.join(ROOT, "test-projects", "agent-eval", "first-dashboard")
DATA = os.path.join(PROJECT, "data")

REGIONS = ["North", "South", "East", "West"]
PRODUCTS = ["Widget", "Gadget", "Doohickey", "Gizmo", "Sprocket", "Thingamajig"]
START = dt.date(2024, 1, 1)


def table_name(filename):
    """The table the import names after the file (`/api/source/upload/`)."""
    return re.sub(r"\W|^(?=\d)", "_", os.path.splitext(filename)[0])


def day(rng, span=365):
    return START + dt.timedelta(days=rng.randrange(span))


def write_rows(path, header, rows, delimiter=",", preamble=()):
    with open(path, "w", newline="", encoding="utf-8") as out:
        for line in preamble:
            out.write(line + "\n")
        writer = csv.writer(out, delimiter=delimiter)
        writer.writerow(header)
        writer.writerows(rows)


def sales_export(path, rng):
    header = ["Order ID", "Order Date", "Customer Name", "Amount ($)", "Region ", "PRODUCT"]
    rows = [
        [
            f"SO-{10000 + i}",
            day(rng).isoformat(),
            f"Customer {rng.randrange(400)}",
            f"{rng.uniform(20, 900):.2f}",
            rng.choice(REGIONS),
            rng.choice(PRODUCTS),
        ]
        for i in range(2000)
    ]
    write_rows(path, header, rows)


def invoices_eu(path, rng):
    header = ["rechnung_nr", "datum", "kunde", "land", "betrag_eur", "mwst_satz"]
    countries = ["DE", "AT", "FR", "NL", "IT", "ES"]
    rows = []
    for i in range(1500):
        amount = f"{rng.uniform(50, 25000):,.2f}".replace(",", "X").replace(".", ",")
        rows.append(
            [
                f"R{2024000 + i}",
                day(rng).strftime("%d.%m.%Y"),
                f"Kunde {rng.randrange(150)}",
                rng.choice(countries),
                amount.replace("X", "."),
                rng.choice(["19%", "7%", "20%", "21%"]),
            ]
        )
    write_rows(path, header, rows, delimiter=";")


def marketing_spend(path, rng):
    months = [dt.date(2024, m, 1).strftime("%b %Y") for m in range(1, 13)]
    channels = ["Search", "Social", "Display", "Email", "Affiliate", "Video", "Podcast", "Events"]
    rows = [[c] + [f"{rng.uniform(1000, 40000):.0f}" for _ in months] for c in channels]
    write_rows(path, ["Channel"] + months, rows)


def store_report(path, rng):
    header = ["Store", "Category", "Units", "Revenue"]
    rows = []
    total_units = total_revenue = 0
    for store in [f"Store {n:02d}" for n in range(1, 21)]:
        store_units = store_revenue = 0
        for category in ["Grocery", "Household", "Electronics", "Apparel", "Garden"]:
            for _ in range(rng.randrange(2, 4)):
                units = rng.randrange(10, 900)
                revenue = round(units * rng.uniform(2, 60), 2)
                rows.append([store, category, units, revenue])
                store_units += units
                store_revenue += revenue
        rows.append([f"{store} Subtotal", "", store_units, round(store_revenue, 2)])
        rows.append(["", "", "", ""])
        total_units += store_units
        total_revenue += store_revenue
    rows.append(["Grand Total", "", total_units, round(total_revenue, 2)])
    write_rows(path, header, rows)


def support_tickets(path, rng):
    header = ["ticket_id", "opened", "priority", "channel", "resolved", "csat", "agent"]
    formats = ["%Y-%m-%d", "%m/%d/%Y", "%b %d %Y"]
    placeholders = ["N/A", "-", "", "unknown"]
    rows = []
    for i in range(3000):
        opened = day(rng)
        rows.append(
            [
                f"T{i:05d}",
                opened.strftime(rng.choice(formats)),
                rng.choice(["P1", "P2", "P3", "P4", "n/a"]),
                rng.choice(["email", "chat", "phone", "Email", "CHAT"]),
                rng.choice(["Y", "N", "Y", "Y"]),
                rng.choice(["1", "2", "3", "4", "5", "5", "4"] + placeholders),
                rng.choice([f"agent_{n}" for n in range(12)] + placeholders),
            ]
        )
    write_rows(path, header, rows)


def inventory_dump(path, rng):
    preamble = ["Inventory report", "Generated 2024-07-01 by WMS export", ""]
    header = ["SKU", "Description", "Warehouse", "On hand", "Reorder point", "Unit cost"]
    rows = [
        [
            f"SKU-{i:05d}",
            f"{rng.choice(PRODUCTS)} {rng.choice(['small', 'medium', 'large'])}",
            rng.choice(["Reno", "Dallas", "Newark", "Atlanta"]),
            rng.randrange(0, 2000),
            rng.randrange(50, 400),
            f"{rng.uniform(1, 250):.2f}",
        ]
        for i in range(500)
    ]
    write_rows(path, header, rows, preamble=preamble)


def payroll(path, rng):
    header = ["Employee #", "Department", "Title", "Salary", "Bonus %", "Start Date", "Remote?"]
    departments = ["Engineering", "Sales", "Support", "Finance", "Marketing", "People"]
    rows = []
    for i in range(800):
        salary = rng.uniform(42000, 210000)
        rows.append(
            [
                f"E{i:04d}",
                rng.choice(departments),
                rng.choice(["Associate", "Senior", "Lead", "Manager", "Director"]),
                f"${salary:,.2f}",
                f"{rng.choice([0, 2.5, 5, 7.5, 10, 12.5, 15])}%",
                (dt.date(2015, 1, 1) + dt.timedelta(days=rng.randrange(3400))).isoformat(),
                rng.choice(["Yes", "No"]),
            ]
        )
    write_rows(path, header, rows)


def survey_responses(path, rng):
    header = ["Response ID", "Submitted At", "Plan", "How likely are you to recommend us? (0-10)"]
    header += ["Which features do you use?", "Satisfaction", "Comments"]
    features = ["dashboards", "alerts", "exports", "api", "sharing"]
    likert = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
    comments = ["", "Love it", "Too slow on Mondays", "Need SSO, please", "Export to PDF, pls"]
    rows = []
    for i in range(1200):
        stamp = dt.datetime(2024, 1, 1) + dt.timedelta(minutes=rng.randrange(260000))
        rows.append(
            [
                i + 1,
                stamp.strftime("%Y-%m-%d %H:%M"),
                rng.choice(["Free", "Pro", "Team", "Enterprise"]),
                rng.choice(range(11)),
                ";".join(sorted(rng.sample(features, rng.randrange(1, 4)))),
                rng.choice(likert),
                rng.choice(comments),
            ]
        )
    write_rows(path, header, rows)


def shipments(path, rng):
    header = ["shipment", "date", "carrier", "origin", "destination", "date", "weight_kg"]
    cities = ['"Portland, OR"', "Austin", "Chicago", "Miami", "Denver", "Boston"]
    rows = []
    for i in range(1000):
        shipped = day(rng)
        row = [
            f"SH{i:05d}",
            shipped.isoformat(),
            rng.choice(["UPS", "FedEx", "DHL", "USPS"]),
            rng.choice(cities).strip('"'),
            rng.choice(cities).strip('"'),
            (shipped + dt.timedelta(days=rng.randrange(1, 9))).isoformat(),
            f"{rng.uniform(0.2, 80):.1f}",
        ]
        rows.append(row)
        if rng.random() < 0.05:
            rows.append(list(row))
    write_rows(path, header, rows)


HASH_MACRO = "CREATE OR REPLACE MACRO h(x) AS CAST(hash(x) % 1000000007 AS BIGINT)"


def web_events_large(path, _rng):
    """1,200,000 rows, written by DuckDB: the large-source guard's file."""
    conn = duckdb.connect()
    conn.execute(HASH_MACRO)
    conn.execute(f"""
        COPY (
            SELECT
                TIMESTAMP '2024-01-01' + to_seconds(h(i) % 15552000) AS event_time,
                'u' || (h(i * 7) % 90000) AS user_id,
                ['/home', '/pricing', '/docs', '/signup', '/blog', '/login'][1 + h(i * 3) % 6] AS page,
                ['desktop', 'mobile', 'tablet'][1 + h(i * 5) % 3] AS device,
                ['US', 'GB', 'DE', 'IN', 'BR', 'FR', 'CA', 'JP'][1 + h(i * 11) % 8] AS country,
                100 + h(i * 13) % 60000 AS duration_ms
            FROM range(1200000) t(i)
        ) TO '{path}' (HEADER, DELIMITER ',')
    """)


FILES = [
    ("fv-01", "Sales Export (Final).csv", sales_export),
    ("fv-02", "invoices_eu.csv", invoices_eu),
    ("fv-03", "marketing_spend.csv", marketing_spend),
    ("fv-04", "store_report.csv", store_report),
    ("fv-05", "support_tickets.csv", support_tickets),
    ("fv-06", "inventory_dump.csv", inventory_dump),
    ("fv-07", "web_events_large.csv", web_events_large),
    ("fv-08", "payroll.csv", payroll),
    ("fv-09", "survey_responses.csv", survey_responses),
    ("fv-10", "shipments.csv", shipments),
]


def import_file(version, filename, original):
    """The table the import materializes, in its own DuckDB file."""
    from visivo.server.views.utils import load_csv

    os.makedirs(os.path.join(DATA, "imports"), exist_ok=True)
    target = os.path.join(DATA, "imports", f"{version}.duckdb")
    with duckdb.connect(target) as conn:
        load_csv(conn, original, table_name(filename))
    return target


def build_files():
    built = []
    for index, (version, filename, write) in enumerate(FILES):
        folder = os.path.join(DATA, "uploads", version)
        os.makedirs(folder, exist_ok=True)
        original = os.path.join(folder, filename)
        write(original, random.Random(100 + index))
        built.append((filename, import_file(version, filename, original)))
    return built


def build_retail(conn, rng):
    conn.execute("CREATE TABLE stores (store_id INTEGER, city VARCHAR, opened DATE)")
    conn.executemany(
        "INSERT INTO stores VALUES (?, ?, ?)",
        [
            (n, city, day(rng, 2000))
            for n, city in enumerate(["Austin", "Denver", "Miami", "Boston", "Seattle"])
        ],
    )
    conn.execute(
        "CREATE TABLE products (product_id INTEGER, name VARCHAR, category VARCHAR, list_price DOUBLE)"
    )
    conn.executemany(
        "INSERT INTO products VALUES (?, ?, ?, ?)",
        [
            (n, f"{p} {s}", p, round(rng.uniform(5, 300), 2))
            for n, (p, s) in enumerate((p, s) for p in PRODUCTS for s in ["S", "M", "L", "XL"])
        ],
    )
    conn.execute("CREATE TABLE customers (customer_id INTEGER, segment VARCHAR, signup_date DATE)")
    conn.executemany(
        "INSERT INTO customers VALUES (?, ?, ?)",
        [
            (n, rng.choice(["Consumer", "Business", "Wholesale"]), day(rng, 900))
            for n in range(3000)
        ],
    )
    conn.execute("""
        CREATE TABLE orders AS
        SELECT i AS order_id, h(i) % 3000 AS customer_id, h(i * 3) % 5 AS store_id,
               DATE '2023-01-01' + CAST(h(i * 7) % 540 AS INTEGER) AS order_date,
               ['web', 'store', 'phone'][1 + h(i * 5) % 3] AS channel
        FROM range(20000) t(i)
    """)
    conn.execute("""
        CREATE TABLE order_items AS
        SELECT o.order_id, h(o.order_id * 11 + k) % 24 AS product_id,
               1 + h(o.order_id * 13 + k) % 4 AS quantity,
               round(5 + (h(o.order_id * 17 + k) % 29500) / 100.0, 2) AS unit_price
        FROM orders o, range(1 + o.order_id % 3) r(k)
    """)


def build_ops_warehouse(conn, rng):
    conn.execute("CREATE TABLE teams (team_id INTEGER, name VARCHAR)")
    conn.executemany(
        "INSERT INTO teams VALUES (?, ?)",
        [(n, t) for n, t in enumerate(["Billing", "Technical", "Accounts", "Onboarding"])],
    )
    conn.execute(
        "CREATE TABLE agents AS SELECT i AS agent_id, 'agent_' || i AS name, i % 4 AS team_id FROM range(40) t(i)"
    )
    conn.execute(
        "CREATE TABLE sla_policies (priority VARCHAR, first_response_hours INTEGER, resolution_hours INTEGER)"
    )
    conn.executemany(
        "INSERT INTO sla_policies VALUES (?, ?, ?)",
        [("urgent", 1, 8), ("high", 4, 24), ("normal", 8, 72), ("low", 24, 168)],
    )
    conn.execute("""
        CREATE TABLE tickets AS
        SELECT i AS ticket_id, h(i) % 40 AS agent_id,
               ['urgent', 'high', 'normal', 'normal', 'low'][1 + h(i * 3) % 5] AS priority,
               TIMESTAMP '2024-01-01' + to_seconds(h(i * 7) % 15552000) AS created_at,
               (h(i * 5) % 200) / 2.0 AS hours_to_resolve,
               ['email', 'chat', 'phone', 'web'][1 + h(i * 11) % 4] AS channel
        FROM range(40000) t(i)
    """)
    conn.execute("""
        CREATE TABLE csat AS
        SELECT ticket_id, 1 + h(ticket_id * 13) % 5 AS score
        FROM tickets WHERE h(ticket_id) % 3 = 0
    """)
    conn.execute("""
        CREATE TABLE ticket_events AS
        SELECT ticket_id, ['opened', 'assigned', 'replied', 'resolved'][1 + k] AS event,
               created_at + to_seconds(k * 3600 * (1 + h(ticket_id) % 10)) AS at
        FROM tickets, range(4) r(k)
    """)
    noise = 0
    for prefix in ["stg_", "tmp_", "backup_", "_airbyte_raw_"]:
        for base in [
            "tickets",
            "agents",
            "teams",
            "csat",
            "ticket_events",
            "users",
            "orgs",
            "macros",
            "tags",
            "views",
            "groups",
        ]:
            if noise >= 44:
                break
            conn.execute(
                f"CREATE TABLE {prefix}{base} AS SELECT i AS id, md5(i::VARCHAR) AS payload FROM range(50) t(i)"
            )
            noise += 1
    for month in range(1, 11):
        conn.execute(
            f"CREATE TABLE audit_log_2024_{month:02d} AS SELECT i AS id, 'evt' AS kind FROM range(20) t(i)"
        )


def build_iot(conn, rng):
    conn.execute("CREATE TABLE sites (site_id INTEGER, name VARCHAR, region VARCHAR)")
    conn.executemany(
        "INSERT INTO sites VALUES (?, ?, ?)",
        [(n, f"Plant {n}", rng.choice(["Americas", "EMEA", "APAC"])) for n in range(12)],
    )
    conn.execute("""
        CREATE TABLE devices AS
        SELECT i AS device_id, i % 12 AS site_id,
               ['temperature', 'pressure', 'vibration', 'humidity'][1 + i % 4] AS sensor_type,
               DATE '2022-01-01' + CAST(h(i) % 700 AS INTEGER) AS installed_on
        FROM range(600) t(i)
    """)
    conn.execute("""
        CREATE TABLE readings AS
        SELECT TIMESTAMP '2024-01-01' + to_seconds(i * 5) AS reading_at,
               h(i) % 600 AS device_id,
               round(20 + (h(i * 7) % 6000) / 100.0, 2) AS value,
               h(i * 3) % 997 = 0 AS is_alarm
        FROM range(3000000) t(i)
    """)


DATABASES = [
    ("retail", build_retail),
    ("ops_warehouse", build_ops_warehouse),
    ("iot_telemetry", build_iot),
]


def build_databases():
    built = []
    folder = os.path.join(DATA, "databases")
    os.makedirs(folder, exist_ok=True)
    for index, (name, build) in enumerate(DATABASES):
        target = os.path.join(folder, f"{name}.duckdb")
        with duckdb.connect(target) as conn:
            conn.execute(HASH_MACRO)
            build(conn, random.Random(200 + index))
        built.append((name, target))
    return built


def main():
    shutil.rmtree(DATA, ignore_errors=True)
    for label, path in build_files() + build_databases():
        with duckdb.connect(path, read_only=True) as conn:
            tables = conn.execute(
                "SELECT table_name, estimated_size FROM duckdb_tables()"
            ).fetchall()
        rows = sum(size for _, size in tables)
        print(f"{label}: {len(tables)} tables, ~{rows} rows -> {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
