import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.backend.seed.generator import build_seed_payload

OUTPUT = PROJECT_ROOT / "data" / "demo_seed.json"


def main() -> None:
    payload = build_seed_payload()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == rendered:
        print(
            f"Seed unchanged: {len(payload['cases'])} cases, "
            f"{len(payload['screening_records'])} screening records"
        )
        return
    OUTPUT.write_text(rendered, encoding="utf-8")
    print(
        f"Seeded {len(payload['cases'])} cases and "
        f"{len(payload['screening_records'])} screening records to {OUTPUT}"
    )


if __name__ == "__main__":
    main()
