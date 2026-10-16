"""Offline guard tests; these are not evidence of deployed resources or live AI."""

import unittest
from unittest.mock import patch

import phase1_azure as phase1
from phase1_agents import validate_output


class SafetyTests(unittest.TestCase):
    def test_windows_cli_preserves_query_separators_in_one_argument(self):
        with patch.object(phase1.os, "name", "nt"):
            command = phase1.cli_command("C:\\Azure CLI\\az.cmd", [
                "rest", "--url", "https://management.azure.com/path?api-version=1&modelName=mini"])
        self.assertIn('"https://management.azure.com/path?api-version=1&modelName=mini"', command)
        self.assertTrue(command.startswith('"C:\\Azure CLI\\az.cmd"'))

    def test_reconciliation_requires_successful_exact_deployment_target(self):
        targets = [{"id": "/subscriptions/authorized/resources/owned"}]
        operation = {"properties": {
            "provisioningState": "Failed", "targetResource": {"id": targets[0]["id"]}}}
        for operations in ([], [operation]):
            with self.assertRaisesRegex(phase1.AzureError, "NotOwnedByRecordedDeployment"):
                phase1.verify_owned_targets(targets, operations)
        operation["properties"]["provisioningState"] = "Succeeded"
        phase1.verify_owned_targets(targets, [operation])
        with self.assertRaisesRegex(phase1.AzureError, "NotOwnedByRecordedDeployment"):
            phase1.verify_owned_targets([{"id": targets[0]["id"] + "-other"}], [operation])

    def test_portal_link_roundtrips_actual_project_scope(self):
        import base64
        project = (f"/subscriptions/{phase1.SUBSCRIPTION}/resourceGroups/{phase1.GROUP}"
                   "/providers/Microsoft.CognitiveServices/accounts/demo/projects/manufacturing-operations-01")
        encoded = phase1.project_portal_url(project).rsplit("/", 1)[1].split(",")
        self.assertEqual(base64.urlsafe_b64decode(encoded[0] + "==").hex(),
                         phase1.SUBSCRIPTION.replace("-", ""))
        self.assertEqual(encoded[1:], [phase1.GROUP, "", "demo", "manufacturing-operations-01"])
        with self.assertRaisesRegex(phase1.AzureError, "UnexpectedProjectScope"):
            phase1.project_portal_url(project.replace(phase1.SUBSCRIPTION, "other"))

    def test_changed_subscription_is_rejected(self):
        with patch.object(phase1, "az", return_value={
            "id": "different", "name": "other", "tenantId": phase1.TENANT, "state": "Enabled",
        }):
            with self.assertRaisesRegex(phase1.AzureError, "CurrentSubscriptionOrTenantChanged"):
                phase1.current_account()

    def test_empty_or_exhausted_quota_never_selects_model(self):
        models = [{"name": "gpt-4.1-mini", "version": "2025-04-14",
                   "skus": [{"name": "Standard", "usageName": "regional", "minimum": None}]}]
        self.assertIsNone(phase1.choose_model(models, []))
        self.assertIsNone(phase1.choose_model(models, [
            {"name": "regional", "limit": 1, "currentValue": 1},
        ]))
        self.assertIsNone(phase1.choose_model(models, [
            {"name": "regional", "limit": None, "currentValue": None},
        ]))
        self.assertEqual(phase1.choose_model(models, [
            {"name": "regional", "limit": 1, "currentValue": 0},
        ])["capacity"], 1)

    def test_global_quota_cannot_enable_regional_model(self):
        models = [{"name": "gpt-4o-mini", "version": "2024-07-18",
                   "skus": [{"name": "GlobalStandard", "usageName": "global", "minimum": None}]}]
        self.assertIsNone(phase1.choose_model(models, [
            {"name": "global", "limit": 1000, "currentValue": 0},
        ]))

    def test_blocked_preflight_cannot_deploy(self):
        with patch.object(phase1, "preflight", return_value={"preflight": {"status": "blocked"}}):
            with patch.object(phase1, "az") as az:
                with self.assertRaisesRegex(phase1.AzureError, "NoDeploymentAttempted"):
                    phase1.deploy()
                az.assert_not_called()

    def test_maintenance_cannot_approve_itself_or_omit_safety(self):
        import json
        from jsonschema import ValidationError

        definitions = json.loads((phase1.ROOT / "infra" / "agents.json").read_text(encoding="utf-8"))
        schema = next(a["schema"] for a in definitions if a["key"] == "MAINTENANCE")
        response = {
            "summary": "Synthetic test only.",
            "actions": [{"priority": 1, "action": "Request qualified review.",
                         "owner_role": "Maintenance lead", "urgency": "immediate_review",
                         "expected_benefit": "Resolve uncertainty.",
                         "safety_checks": ["Use approved site procedures."]}],
            "preventive_steps": ["Review existing maintenance records."],
            "qualified_human_review_required": True, "approved": True,
        }
        with self.assertRaises(ValidationError):
            validate_output(schema, response)
        response["approved"] = False
        response["actions"][0]["safety_checks"] = []
        with self.assertRaisesRegex(ValueError, "EmptyStructuredList"):
            validate_output(schema, response)

    def test_schema_valid_but_empty_summary_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "EmptyStructuredText"):
            validate_output({"type": "object", "properties": {"summary": {"type": "string"}}},
                            {"summary": "  "})


if __name__ == "__main__":
    unittest.main()
