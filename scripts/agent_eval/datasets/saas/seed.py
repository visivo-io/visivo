"""Build test-projects/agent-eval/saas/saas.duckdb: a seeded, synthetic B2B
SaaS product with accounts, users, an event log and monthly subscriptions.

The data carries signals an analyst should find: an activation funnel with
real drop-off, channels that retain differently, plan-driven revenue, a
feature launch in March 2024, an outage day, and weekday seasonality.

    python scripts/agent_eval/datasets/saas/seed.py
"""

import csv
import datetime as dt
import os
import tempfile
import random
import sys

import duckdb

ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
)
TARGET = os.path.join(ROOT, "test-projects", "agent-eval", "saas", "saas.duckdb")

SEED = 7
START = dt.date(2023, 1, 1)
END = dt.date(2024, 6, 30)
LAUNCH = dt.date(2024, 3, 4)
OUTAGE = dt.date(2023, 11, 14)

INDUSTRIES = [
    "Retail",
    "Fintech",
    "Healthcare",
    "Logistics",
    "Media",
    "Education",
    "Manufacturing",
    "SaaS",
]
COUNTRIES = [
    "US",
    "US",
    "US",
    "GB",
    "DE",
    "FR",
    "CA",
    "AU",
    "NL",
    "SE",
    "IN",
    "BR",
    "JP",
    "ES",
    "SG",
]
CHANNELS = {
    "organic": 0.34,
    "paid_search": 0.26,
    "referral": 0.14,
    "partner": 0.11,
    "outbound": 0.15,
}
# Monthly churn hazard by channel: referral and partner accounts stay longer.
CHURN = {
    "organic": 0.035,
    "paid_search": 0.055,
    "referral": 0.018,
    "partner": 0.022,
    "outbound": 0.045,
}
PLANS = {"Free": 0, "Starter": 49, "Team": 25, "Enterprise": 60}  # Team/Enterprise priced per seat
FUNNEL = ["signed_up", "created_project", "connected_source", "built_dashboard", "invited_teammate"]
STEP_RATE = [1.0, 0.78, 0.55, 0.62, 0.41]
ROLES = ["admin", "analyst", "analyst", "viewer", "viewer", "viewer"]


def pick(weights, rng):
    names = list(weights)
    return rng.choices(names, weights=[weights[n] for n in names])[0]


def days(a, b):
    return (b - a).days


def main():
    rng = random.Random(SEED)
    accounts, users, events, subs = [], [], [], []
    event_id = 0
    for account_id in range(1, 3001):
        signup = START + dt.timedelta(
            days=int(rng.random() ** 0.8 * days(START, END - dt.timedelta(days=30)))
        )
        channel = pick(CHANNELS, rng)
        industry = rng.choice(INDUSTRIES)
        size = rng.choices(["1-10", "11-50", "51-200", "201-1000", "1000+"], [30, 30, 20, 13, 7])[0]
        plan = "Free"
        seats = {"1-10": 3, "11-50": 8, "51-200": 18, "201-1000": 40, "1000+": 90}[size]
        seats = max(1, int(seats * rng.uniform(0.5, 1.5)))
        churned = None
        month = dt.date(signup.year, signup.month, 1)
        history = []
        while month <= END:
            if plan == "Free" and rng.random() < (
                0.09 if channel in ("referral", "partner") else 0.05
            ):
                plan = "Starter" if seats <= 5 else "Team"
            elif plan == "Starter" and seats > 5 and rng.random() < 0.08:
                plan = "Team"
            elif plan == "Team" and size in ("201-1000", "1000+") and rng.random() < 0.04:
                plan = "Enterprise"
            if plan in ("Team", "Enterprise") and rng.random() < 0.12:
                seats = max(1, seats + rng.choice([-2, -1, 1, 1, 2, 3, 5]))
            mrr = 0 if plan == "Free" else PLANS[plan] if plan == "Starter" else PLANS[plan] * seats
            history.append((month, plan, seats, mrr))
            hazard = CHURN[channel] * (
                1.6 if plan == "Free" else 0.6 if plan == "Enterprise" else 1.0
            )
            if rng.random() < hazard:
                churned = month + dt.timedelta(days=rng.randint(5, 25))
                break
            month = dt.date(month.year + (month.month == 12), month.month % 12 + 1, 1)
        for month_start, p, s, mrr in history:
            subs.append((account_id, month_start, p, s, mrr))
        accounts.append(
            (
                account_id,
                f"Account {account_id:04d}",
                industry,
                rng.choice(COUNTRIES),
                size,
                channel,
                signup,
                history[-1][1],
                churned,
            )
        )
        active_until = min(churned or END, END)
        n_users = max(1, min(seats, int(rng.uniform(1, 6))))
        for u in range(n_users):
            user_id = account_id * 10 + u
            created = signup + dt.timedelta(days=rng.randint(0, 20) if u else 0)
            if created > active_until:
                continue
            role = "admin" if u == 0 else rng.choice(ROLES)
            users.append((user_id, account_id, role, created))
            # The funnel, once per user; channel and the launch move the rates.
            lift = (
                1.15
                if channel in ("referral", "partner")
                else 0.9 if channel == "paid_search" else 1.0
            )
            t = dt.datetime.combine(created, dt.time(rng.randint(8, 18), rng.randint(0, 59)))
            reached = 0
            for step, rate in zip(FUNNEL, STEP_RATE):
                boost = 1.25 if step == "built_dashboard" and t.date() >= LAUNCH else 1.0
                if step != "signed_up" and rng.random() > min(0.97, rate * lift * boost):
                    break
                event_id += 1
                events.append(
                    (
                        event_id,
                        user_id,
                        account_id,
                        step,
                        t,
                        rng.choice(["web", "web", "web", "desktop"]),
                    )
                )
                reached += 1
                t += dt.timedelta(hours=rng.expovariate(1 / 30))
            if reached < 3:
                continue
            # Ongoing use while the account is active: weekday-heavy, an outage day.
            day = created
            weekly = rng.uniform(0.3, 1.6) * (1.3 if role != "viewer" else 0.7)
            while day <= active_until:
                weekday_factor = 1.0 if day.weekday() < 5 else 0.25
                launch_factor = 1.35 if day >= LAUNCH else 1.0
                rate = (
                    weekly / 5 * weekday_factor * launch_factor * (0.08 if day == OUTAGE else 1.0)
                )
                count = (
                    int(rate + rng.random()) if rate < 1 else int(rng.gauss(rate, rate**0.5) + 0.5)
                )
                for _ in range(max(0, min(12, count))):
                    name = rng.choices(
                        [
                            "viewed_dashboard",
                            "built_dashboard",
                            "ran_query",
                            "shared_dashboard",
                            "exported_csv",
                        ],
                        [55, 8 * launch_factor, 25, 6, 6],
                    )[0]
                    if role == "viewer" and name in ("built_dashboard", "ran_query"):
                        name = "viewed_dashboard"
                    event_id += 1
                    ts = dt.datetime.combine(
                        day, dt.time(rng.randint(7, 20), rng.randint(0, 59), rng.randint(0, 59))
                    )
                    events.append(
                        (
                            event_id,
                            user_id,
                            account_id,
                            name,
                            ts,
                            rng.choice(["web", "web", "web", "desktop"]),
                        )
                    )
                day += dt.timedelta(days=1)

    os.makedirs(os.path.dirname(TARGET), exist_ok=True)
    if os.path.exists(TARGET):
        os.remove(TARGET)
    db = duckdb.connect(TARGET)
    schemas = {
        "accounts": (
            accounts,
            "account_id INTEGER, name VARCHAR, industry VARCHAR, country VARCHAR, "
            "company_size VARCHAR, acquisition_channel VARCHAR, signup_date DATE, "
            "current_plan VARCHAR, churned_at DATE",
        ),
        "users": (users, "user_id INTEGER, account_id INTEGER, role VARCHAR, created_at DATE"),
        "events": (
            events,
            "event_id BIGINT, user_id INTEGER, account_id INTEGER, event_name VARCHAR, "
            "occurred_at TIMESTAMP, platform VARCHAR",
        ),
        "subscriptions_monthly": (
            subs,
            "account_id INTEGER, month DATE, plan VARCHAR, seats INTEGER, mrr DOUBLE",
        ),
    }
    with tempfile.TemporaryDirectory() as tmp:
        for table, (rows, columns) in schemas.items():
            path = os.path.join(tmp, f"{table}.csv")
            with open(path, "w", newline="") as out:
                csv.writer(out).writerows(rows)
            db.execute(f"CREATE TABLE {table} ({columns})")
            db.execute(f"COPY {table} FROM '{path}' (HEADER false, NULLSTR '')")
    for table in ("accounts", "users", "events", "subscriptions_monthly"):
        print(table, db.execute(f"SELECT count(*) FROM {table}").fetchone()[0])
    db.close()


if __name__ == "__main__":
    sys.exit(main())
