import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.seed import seed

log = logging.getLogger(__name__)


class StoreUnavailable(Exception):
    pass


class Conflict(Exception):
    pass


class SQLiteStore:
    """One JSON state row; mutations hold a database write lock until commit."""

    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def connection(self, write=False):
        connection = None
        try:
            connection = sqlite3.connect(self.path, timeout=15, isolation_level=None)
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield connection
            connection.commit()
        except (sqlite3.Error, OSError, ValueError, TypeError) as exc:
            log.error("SQLite operation failed (%s)", type(exc).__name__)
            raise StoreUnavailable("Local demo database unavailable. Refresh before retrying; no memory fallback is used.") from None
        finally:
            if connection is not None:
                # Closing rolls back any uncommitted work, including failed callbacks.
                connection.close()

    def ensure(self):
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            log.error("SQLite directory initialization failed (%s)", type(exc).__name__)
            raise StoreUnavailable("Cannot initialize the local demo database directory.") from None
        with self.connection(write=True) as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS demo_state "
                "(id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL, revision INTEGER NOT NULL)"
            )
            if connection.execute("SELECT 1 FROM demo_state WHERE id = 1").fetchone() is None:
                state = seed()
                # A replacement container must leave a quiet window for the old revision.
                state["ai"]["next_eligible_at"] = (
                    datetime.now(timezone.utc) + timedelta(seconds=65)
                ).isoformat().replace("+00:00", "Z")
                connection.execute("INSERT INTO demo_state VALUES (1, ?, 1)",
                                   (json.dumps(state, allow_nan=False),))

    def read(self):
        with self.connection() as connection:
            row = connection.execute("SELECT state, revision FROM demo_state WHERE id = 1").fetchone()
            if row is None:
                raise StoreUnavailable("Local demo state is missing. Restart the application to initialize it.")
            return json.loads(row[0]), row[1]

    def mutate(self, change):
        with self.connection(write=True) as connection:
            row = connection.execute("SELECT state, revision FROM demo_state WHERE id = 1").fetchone()
            if row is None:
                raise StoreUnavailable("Local demo state is missing. Restart the application to initialize it.")
            state = json.loads(row[0])
            result = change(state)
            connection.execute("UPDATE demo_state SET state = ?, revision = ? WHERE id = 1",
                               (json.dumps(state, allow_nan=False), row[1] + 1))
            return result

    def close(self):
        # Connections belong to individual operations, never to a FastAPI worker thread.
        pass
