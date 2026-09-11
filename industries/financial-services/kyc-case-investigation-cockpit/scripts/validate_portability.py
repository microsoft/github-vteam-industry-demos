import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.backend.seed.generator import PRIMARY_CASE_ID, build_seed_payload
from scripts.bootstrap_foundry_agents import agent_specs

EXCLUDED_DIRECTORIES = {
    ".git",
    ".azure",
    ".azd-hooks",
    ".copilot",
    ".vscode",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "htmlcov",
}
EXCLUDED_FILES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.staging",
    ".env.test",
    ".mcp.json",
    "quad_initial_prompt.md",
    "squad_second_prompt.md",
}
MUTABLE_SQUAD_PARTS = {
    "memory",
    "identity",
    "orchestration-log",
    "log",
    "sessions",
    ".scratch",
    ".cache",
}
DOCUMENTATION_EXCLUSIONS = {
    ".github/skills/secret-handling/SKILL.md",
}
TEXT_SUFFIXES = {
    ".bicep",
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".py",
    ".ps1",
    ".sh",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
RISK_PATTERNS = {
    "local Windows user path": re.compile(r"[A-Za-z]:\\Users\\[^\\\r\n]+"),
    "concrete ARM subscription resource ID": re.compile(
        r"/subscriptions/[0-9a-fA-F-]{36}"
    ),
    "version-pinned KYC agent reference": re.compile(
        r"agt-kyc-(?:extract|complete|risk|summary):\d+"
    ),
    "private key material": re.compile(r"-----BEGIN [A-Z ]+PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "JWT token": re.compile(
        r"\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"
    ),
}


def is_mutable_squad_path(relative: Path) -> bool:
    if not relative.parts or relative.parts[0] != ".squad":
        return False
    if any(part in MUTABLE_SQUAD_PARTS for part in relative.parts):
        return True
    if relative.name in {"history.md", "audit-trail.md", ".first-run"}:
        return True
    if relative.as_posix() in {
        ".squad/config.json",
        ".squad/casting/history.json",
        ".squad/casting/registry.json",
    }:
        return True
    return False


def shareable_files() -> list[Path]:
    files: list[Path] = []
    for path in PROJECT_ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(PROJECT_ROOT)
        if any(part in EXCLUDED_DIRECTORIES for part in relative.parts):
            continue
        if path.name in EXCLUDED_FILES or path.suffix not in TEXT_SUFFIXES:
            continue
        if relative.as_posix() in DOCUMENTATION_EXCLUSIONS:
            continue
        if relative.as_posix().startswith(".squad/templates/"):
            continue
        if path.name.startswith(".env") and path.name not in {
            ".env.example",
            ".env.sample",
            ".env.template",
        }:
            continue
        if is_mutable_squad_path(relative):
            continue
        files.append(path)
    return files


def scan_source(files: list[Path]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in files:
        if path.name == "validate_portability.py":
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        relative = str(path.relative_to(PROJECT_ROOT))
        for category, pattern in RISK_PATTERNS.items():
            if pattern.search(text):
                findings.append((relative, category))
        for line in text.splitlines():
            lowered = line.lower()
            if (
                re.search(
                    r"(?i)(api[_-]?key|client[_-]?secret|password|"
                    r"access[_-]?token|connection[_-]?string)\s*[:=]",
                    line,
                )
                and "<" not in line
                and "${" not in line
                and "example" not in lowered
            ):
                findings.append((relative, "possible credential assignment"))
                break
    return sorted(set(findings))


def validate_ignored_paths() -> list[str]:
    expected = [
        ".azure/example/.env",
        ".env",
        ".env.local",
        ".copilot/session.json",
        ".vscode/settings.json",
        ".mcp.json",
        "app/backend/.venv/pyvenv.cfg",
        "app/frontend/node_modules/package/index.js",
        "app/frontend/dist/index.html",
        ".squad/agents/example/history.md",
        ".squad/memory/audit.jsonl",
    ]
    missing: list[str] = []
    for candidate in expected:
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", "--quiet", candidate],
            cwd=PROJECT_ROOT,
            check=False,
        )
        if result.returncode != 0:
            missing.append(candidate)
    return missing


def validate_seed() -> list[str]:
    payload = build_seed_payload()
    errors: list[str] = []
    if len(payload["cases"]) != 25:
        errors.append("deterministic seed must contain 25 cases")
    if len(payload["screening_records"]) != 40:
        errors.append("deterministic seed must contain 40 screening records")
    if not any(case["id"] == PRIMARY_CASE_ID for case in payload["cases"]):
        errors.append(f"deterministic seed must contain {PRIMARY_CASE_ID}")
    return errors


def validate_azd_configuration() -> list[str]:
    azure_yaml = (PROJECT_ROOT / "azure.yaml").read_text(encoding="utf-8")
    required = [
        "postprovision:",
        "./scripts/bootstrap_foundry_agents.py",
        "remoteBuild: true",
    ]
    errors = [
        f"azure.yaml is missing {item}"
        for item in required
        if item not in azure_yaml
    ]
    if len(agent_specs()) != 4:
        errors.append("Foundry bootstrap must define exactly four agents")
    return errors


def main() -> None:
    files = shareable_files()
    findings = scan_source(files)
    ignored_failures = validate_ignored_paths()
    errors = validate_seed() + validate_azd_configuration()
    errors.extend(
        f"ignore rule missing for {path}" for path in ignored_failures
    )
    errors.extend(
        f"{path}: {category}" for path, category in findings
    )
    if errors:
        print("Portability validation failed:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)
    print(
        "Portability validation passed: "
        f"{len(files)} shareable text files scanned, "
        "25 cases, 40 screening records, 4 Foundry agents."
    )


if __name__ == "__main__":
    main()
