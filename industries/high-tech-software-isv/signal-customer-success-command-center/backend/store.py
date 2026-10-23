import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from backend.data import health, seed_accounts


def now():
    return datetime.now(timezone.utc).isoformat()


class Conflict(Exception):
    pass


class Store:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS accounts(
                id TEXT PRIMARY KEY, account TEXT NOT NULL, risk TEXT, plan TEXT,
                edits TEXT NOT NULL DEFAULT '{}', action_states TEXT NOT NULL DEFAULT '{}',
                revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS events(
                id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL,
                at TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS ai_runs(
                response_id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
                kind TEXT NOT NULL, envelope TEXT NOT NULL, at TEXT NOT NULL)""")
            today = datetime.now(timezone.utc).date()
            for account in seed_accounts(today):
                db.execute("INSERT OR IGNORE INTO accounts(id,account,updated_at) VALUES(?,?,?)",
                           (account["id"], json.dumps(account), now()))

    @staticmethod
    def decode(row):
        account = json.loads(row["account"])
        return {"account": account, "health": health(account),
                "risk": json.loads(row["risk"]) if row["risk"] else None,
                "plan": json.loads(row["plan"]) if row["plan"] else None,
                "edits": json.loads(row["edits"]), "action_states": json.loads(row["action_states"]),
                "revision": row["revision"], "updated_at": row["updated_at"]}

    def list(self):
        with self.connection() as db:
            return [self.decode(row) for row in db.execute("SELECT * FROM accounts ORDER BY id")]

    def get(self, account_id):
        with self.connection() as db:
            row = db.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
            if row is None:
                return None
            result = self.decode(row)
            result["history"] = [dict(event) for event in db.execute(
                "SELECT id,at,title,detail FROM events WHERE account_id=? ORDER BY id DESC LIMIT 100",
                (account_id,))]
            return result

    def change(self, account_id, revision, transform, title, detail):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
            if row is None:
                raise KeyError(account_id)
            if row["revision"] != revision:
                raise Conflict()
            state = self.decode(row)
            transform(state)
            at = now()
            for kind in ("risk", "plan"):
                envelope = state[kind]
                if envelope:
                    db.execute("INSERT OR IGNORE INTO ai_runs VALUES(?,?,?,?,?)",
                               (envelope["response_id"], account_id, kind, json.dumps(envelope), envelope["at"]))
            db.execute("""UPDATE accounts SET account=?,risk=?,plan=?,edits=?,action_states=?,
                          revision=revision+1,updated_at=? WHERE id=? AND revision=?""",
                       (json.dumps(state["account"]), json.dumps(state["risk"]) if state["risk"] else None,
                        json.dumps(state["plan"]) if state["plan"] else None, json.dumps(state["edits"]),
                        json.dumps(state["action_states"]), at, account_id, revision))
            db.execute("INSERT INTO events(account_id,at,title,detail) VALUES(?,?,?,?)",
                       (account_id, at, title, detail))
        return self.get(account_id)
