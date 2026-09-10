from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from typing import Any


LOCATION = "swedencentral"
DEFAULTS = {
    "AZURE_AI_SEARCH_SKU": "basic",
    "AIPF_STORAGE_SECURITY_CONTROL_IGNORE": "false",
    "AZURE_AI_MODEL_NAME": "gpt-5-mini",
    "AZURE_AI_MODEL_FORMAT": "OpenAI",
    "AZURE_AI_MODEL_VERSION": "2025-08-07",
    "AZURE_AI_MODEL_DEPLOYMENT_SKU": "DataZoneStandard",
    "AZURE_AI_MODEL_CAPACITY": "10",
}


def run(command: list[str]) -> str:
    executable = shutil.which(command[0])
    if executable is None:
        raise RuntimeError(f"Required command was not found on PATH: {command[0]}")
    result = subprocess.run(
        [executable, *command[1:]],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"{' '.join(command)} failed: {detail}")
    return result.stdout.strip()


def azd_set(name: str, value: str) -> None:
    run(["azd", "env", "set", name, value])
    os.environ[name] = value


def read_json(command: list[str]) -> Any:
    return json.loads(run(command))


def principal_type_for_account(account: dict[str, Any]) -> str:
    account_type = str(account.get("user", {}).get("type", "")).lower()
    if account_type == "user":
        return "User"
    if account_type in {"serviceprincipal", "service_principal"}:
        return "ServicePrincipal"
    raise RuntimeError(
        f"Unsupported Azure principal type '{account_type}'. Use an interactive user or service principal."
    )


def resolve_principal(account: dict[str, Any]) -> tuple[str, str]:
    account_name = str(account.get("user", {}).get("name", ""))
    principal_type = principal_type_for_account(account)
    if principal_type == "User":
        principal_id = run(["az", "ad", "signed-in-user", "show", "--query", "id", "-o", "tsv"])
        return principal_id, "User"
    if principal_type == "ServicePrincipal":
        principal_id = run(["az", "ad", "sp", "show", "--id", account_name, "--query", "id", "-o", "tsv"])
        return principal_id, "ServicePrincipal"
    raise AssertionError("Unreachable principal type.")


def preserve_existing_environment_defaults(subscription_id: str) -> None:
    resource_group = os.getenv("AZURE_RESOURCE_GROUP_NAME") or os.getenv("AZURE_RESOURCE_GROUP")

    search_name = os.getenv("AZURE_AI_SEARCH_SERVICE_NAME")
    if not os.getenv("AZURE_AI_SEARCH_SKU") and resource_group and search_name:
        try:
            sku = run(
                [
                    "az",
                    "search",
                    "service",
                    "show",
                    "--subscription",
                    subscription_id,
                    "--resource-group",
                    resource_group,
                    "--name",
                    search_name,
                    "--query",
                    "sku.name",
                    "-o",
                    "tsv",
                ]
            )
            if sku:
                DEFAULTS["AZURE_AI_SEARCH_SKU"] = sku.lower()
        except RuntimeError:
            pass

    storage_name = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
    if (
        not os.getenv("AIPF_STORAGE_SECURITY_CONTROL_IGNORE")
        and resource_group
        and storage_name
    ):
        try:
            tag = run(
                [
                    "az",
                    "storage",
                    "account",
                    "show",
                    "--subscription",
                    subscription_id,
                    "--resource-group",
                    resource_group,
                    "--name",
                    storage_name,
                    "--query",
                    "tags.SecurityControl",
                    "-o",
                    "tsv",
                ]
            )
            if tag.lower() == "ignore":
                DEFAULTS["AIPF_STORAGE_SECURITY_CONTROL_IGNORE"] = "true"
        except RuntimeError:
            pass


def validate_free_search_quota(subscription_id: str, search_sku: str) -> None:
    if search_sku.lower() != "free":
        return
    existing_name = os.getenv("AZURE_AI_SEARCH_SERVICE_NAME", "")
    services = read_json(
        [
            "az",
            "resource",
            "list",
            "--subscription",
            subscription_id,
            "--resource-type",
            "Microsoft.Search/searchServices",
            "--query",
            "[?sku.name=='free'].name",
            "-o",
            "json",
        ]
    )
    other_services = [name for name in services if name != existing_name]
    if other_services:
        raise RuntimeError(
            "Azure AI Search Free SKU is limited to one service per subscription and is already "
            f"in use by: {', '.join(other_services)}. Set AZURE_AI_SEARCH_SKU=basic (recommended) "
            "or another supported SKU before running azd up."
        )


def model_catalog(subscription_id: str) -> list[dict[str, Any]]:
    url = (
        "https://management.azure.com/subscriptions/"
        f"{subscription_id}/providers/Microsoft.CognitiveServices/locations/"
        f"{LOCATION}/models?api-version=2024-10-01"
    )
    return read_json(["az", "rest", "--method", "get", "--url", url, "-o", "json"])["value"]


def validate_model(subscription_id: str) -> None:
    model_name = os.environ["AZURE_AI_MODEL_NAME"]
    model_version = os.environ["AZURE_AI_MODEL_VERSION"]
    model_sku = os.environ["AZURE_AI_MODEL_DEPLOYMENT_SKU"]
    capacity = int(os.environ["AZURE_AI_MODEL_CAPACITY"])

    matches = [
        item
        for item in model_catalog(subscription_id)
        if item.get("model", {}).get("name") == model_name
        and item.get("model", {}).get("version") == model_version
    ]
    sku = next(
        (
            sku
            for item in matches
            for sku in item.get("model", {}).get("skus", [])
            if sku.get("name", "").lower() == model_sku.lower()
        ),
        None,
    )
    if not sku:
        raise RuntimeError(
            f"Model {model_name} version {model_version} with SKU {model_sku} is not "
            "available in Sweden Central. Set Sweden Central-compatible AZURE_AI_MODEL_* "
            "values; this template never falls back to another region."
        )

    capacity_rules = sku.get("capacity", {})
    minimum = int(capacity_rules.get("minimum", 1))
    maximum = int(capacity_rules.get("maximum", capacity))
    step = int(capacity_rules.get("step", 1))
    if capacity < minimum or capacity > maximum or (capacity - minimum) % step:
        raise RuntimeError(
            f"Capacity {capacity} is invalid for {model_sku}; expected {minimum}-{maximum} "
            f"in increments of {step}."
        )

    usage = read_json(
        [
            "az",
            "cognitiveservices",
            "usage",
            "list",
            "--location",
            LOCATION,
            "--subscription",
            subscription_id,
            "-o",
            "json",
        ]
    )
    compact_model = model_name.lower().replace("-", "").replace(".", "")
    quota = next(
        (
            item
            for item in usage
            if model_sku.lower() in item.get("name", {}).get("value", "").lower()
            and compact_model
            in item.get("name", {}).get("value", "").lower().replace("-", "").replace(".", "")
        ),
        None,
    )
    if not quota:
        raise RuntimeError(
            f"No {model_sku} quota entry for {model_name} was found in Sweden Central. "
            "Request quota or choose another Sweden Central-compatible model/SKU."
        )

    existing_account = os.getenv("AZURE_AI_FOUNDRY_ACCOUNT_NAME")
    existing_deployment = os.getenv("AZURE_AI_MODEL_DEPLOYMENT_NAME")
    is_existing = False
    if existing_account and existing_deployment:
        resource_group = os.getenv("AZURE_RESOURCE_GROUP_NAME") or os.getenv("AZURE_RESOURCE_GROUP")
        if resource_group:
            try:
                run(
                    [
                        "az",
                        "cognitiveservices",
                        "account",
                        "deployment",
                        "show",
                        "--subscription",
                        subscription_id,
                        "--resource-group",
                        resource_group,
                        "--name",
                        existing_account,
                        "--deployment-name",
                        existing_deployment,
                        "-o",
                        "none",
                    ]
                )
                is_existing = True
            except RuntimeError:
                pass

    available = float(quota["limit"]) - float(quota["currentValue"])
    if not is_existing and available < capacity:
        raise RuntimeError(
            f"Insufficient Sweden Central quota for {model_name}/{model_sku}: "
            f"{available:g} capacity units available, {capacity} requested."
        )


def main() -> None:
    account = read_json(["az", "account", "show", "-o", "json"])
    active_subscription = account["id"]
    requested_subscription = os.getenv("AZURE_SUBSCRIPTION_ID")
    if requested_subscription and requested_subscription != active_subscription:
        raise RuntimeError(
            f"Azure CLI is using subscription {active_subscription}, but the azd environment "
            f"targets {requested_subscription}. Run az account set --subscription "
            f"{requested_subscription} before azd up."
        )
    if not requested_subscription:
        azd_set("AZURE_SUBSCRIPTION_ID", active_subscription)

    location = os.getenv("AZURE_LOCATION")
    if location and location.lower() != LOCATION:
        raise RuntimeError(
            f"AZURE_LOCATION must be {LOCATION}; automatic regional fallback is prohibited."
        )
    if not location:
        azd_set("AZURE_LOCATION", LOCATION)

    principal_id = os.getenv("AZURE_DEPLOYER_PRINCIPAL_ID")
    principal_type = os.getenv("AZURE_DEPLOYER_PRINCIPAL_TYPE")
    if not principal_id:
        principal_id, principal_type = resolve_principal(account)
    else:
        normalized_types = {
            "user": "User",
            "serviceprincipal": "ServicePrincipal",
            "service_principal": "ServicePrincipal",
        }
        if principal_type:
            principal_type = normalized_types.get(principal_type.lower())
            if not principal_type:
                raise RuntimeError(
                    "AZURE_DEPLOYER_PRINCIPAL_TYPE must be User or ServicePrincipal when a "
                    "deployment principal object ID is supplied."
                )
        else:
            principal_type = principal_type_for_account(account)
    azd_set("AZURE_DEPLOYER_PRINCIPAL_ID", principal_id)
    azd_set("AZURE_DEPLOYER_PRINCIPAL_TYPE", str(principal_type))

    preserve_existing_environment_defaults(active_subscription)
    for name, default in DEFAULTS.items():
        if not os.getenv(name):
            azd_set(name, default)

    validate_free_search_quota(active_subscription, os.environ["AZURE_AI_SEARCH_SKU"])
    validate_model(active_subscription)

    print("Primary and only deployment region: Sweden Central")
    print("Azure region code: swedencentral")
    print(f"Subscription: {account.get('name')} ({active_subscription})")
    print(f"Deployment principal: {principal_type} {principal_id}")
    print(
        "Model preflight passed: "
        f"{os.environ['AZURE_AI_MODEL_NAME']} "
        f"{os.environ['AZURE_AI_MODEL_VERSION']} / "
        f"{os.environ['AZURE_AI_MODEL_DEPLOYMENT_SKU']} "
        f"capacity {os.environ['AZURE_AI_MODEL_CAPACITY']}."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Preprovision validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
