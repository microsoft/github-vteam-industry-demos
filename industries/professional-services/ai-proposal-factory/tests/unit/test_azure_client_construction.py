import ast
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    "relative_path",
    [
        Path("app/backend/proposal_factory/adapters.py"),
        Path("scripts/seed_demo.py"),
    ],
)
def test_table_service_clients_use_keyword_credential(relative_path: Path):
    tree = ast.parse((ROOT / relative_path).read_text("utf-8"))
    calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "TableServiceClient"
    ]

    assert len(calls) == 1
    assert len(calls[0].args) == 1
    assert any(keyword.arg == "credential" for keyword in calls[0].keywords)
