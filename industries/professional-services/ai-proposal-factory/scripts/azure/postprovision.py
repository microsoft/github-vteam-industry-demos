from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = Path(
    os.getenv("AIPF_DEPLOYMENT_OUTPUT", SCRIPT_DIR / "deployment-output.json")
)


def run(command: list[str], attempts: int = 1) -> str:
    executable = shutil.which(command[0])
    if executable is None:
        raise RuntimeError(f"Required command was not found on PATH: {command[0]}")
    resolved_command = [executable, *command[1:]]
    last_detail = ""
    for attempt in range(1, attempts + 1):
        result = subprocess.run(
            resolved_command,
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            if result.stdout.strip():
                print(result.stdout.strip())
            return result.stdout.strip()
        last_detail = result.stderr.strip() or result.stdout.strip()
        if attempt < attempts:
            print(
                f"Attempt {attempt}/{attempts} failed while Azure RBAC propagates; retrying in 15 seconds."
            )
            time.sleep(15)
    raise RuntimeError(f"{' '.join(command)} failed: {last_detail}")


def azd_set(name: str, value: str) -> None:
    run(["azd", "env", "set", name, value])
    os.environ[name] = value


def required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Required azd output {name} is missing.")
    return value


def main() -> None:
    if required("AZURE_LOCATION").lower() != "swedencentral":
        raise RuntimeError("Postprovision refuses to configure resources outside Sweden Central.")

    run([sys.executable, str(SCRIPT_DIR / "seed_platform.py")], attempts=12)
    run([sys.executable, str(SCRIPT_DIR / "deploy_agents.py")], attempts=12)

    deployment = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    agent_ids = {
        "AIPF_REQUIREMENTS_AGENT_ID": deployment["agents"]["requirements"]["id"],
        "AIPF_PROPOSAL_AGENT_ID": deployment["agents"]["proposal"]["id"],
        "AIPF_RISK_AGENT_ID": deployment["agents"]["risk"]["id"],
    }
    for name, value in agent_ids.items():
        azd_set(name, value)

    command = [
        "az",
        "containerapp",
        "update",
        "--subscription",
        required("AZURE_SUBSCRIPTION_ID"),
        "--resource-group",
        required("AZURE_RESOURCE_GROUP_NAME"),
        "--name",
        required("SERVICE_APP_NAME"),
        "--set-env-vars",
        *(f"{name}={value}" for name, value in agent_ids.items()),
        "AIPF_DEMO_MODE=false",
        "-o",
        "none",
    ]
    run(command, attempts=4)
    azd_set("AIPF_PLATFORM_BOOTSTRAPPED", "true")
    print(
        "Platform bootstrap complete: knowledge seeded, three Foundry Agents configured, "
        "and environment-specific agent IDs applied to the Container App."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Postprovision bootstrap failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
