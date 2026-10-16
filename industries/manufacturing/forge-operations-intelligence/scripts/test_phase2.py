"""Offline deployment checks; no Azure calls or inference."""
import copy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import phase2_deploy as phase2


class DeploymentTests(unittest.TestCase):
    def test_deploy_does_not_reconcile_unused_storage(self):
        calls, records = [], {}
        config = {"image": "registry/app@sha256:example", "status": "blocked_storage_governance"}

        def azure(*args):
            calls.append(args)
            self.assertEqual(args[:3], ("deployment", "group", "create"))
            self.assertIn("Incremental", args)
            return {"id": "deployment", "properties": {"provisioningState": "Succeeded", "outputs": {}}}

        with patch.object(phase2, "load", return_value=config), \
                patch.object(phase2, "save", side_effect=lambda p, v: records.update({str(p): copy.deepcopy(v)})), \
                patch.object(phase2, "record"), patch.object(phase2, "az", side_effect=azure):
            phase2.deploy()
        self.assertEqual(len(calls), 1)
        parameters = next(v for k, v in records.items() if k.endswith("phase2-parameters.json"))
        env = parameters["parameters"]["runtimeEnvironment"]["value"]
        self.assertFalse(any(e["name"].startswith("AZURE_STORAGE") for e in env))
        saved = records[str(phase2.CONFIG)]
        self.assertNotIn("status", saved)
        self.assertIn({"name": "SQLITE_PATH", "value": "/app/data/manufacturing.db"},
                      saved["runtimeEnvironment"])

    def check_readiness(self, asset_status=200, replica_ready=True):
        config = {
            "image": "registry/app@sha256:example",
            "runtimeEnvironment": [{"name": "SQLITE_PATH", "value": "/app/data/manufacturing.db"}],
        }
        app = {
            "id": "app", "identity": {"userAssignedIdentities": {
                phase2.PHASE1["MANAGED_IDENTITY_RESOURCE_ID"].lower(): {}}},
            "properties": {
                "provisioningState": "Succeeded", "latestRevisionName": "revision",
                "configuration": {"activeRevisionsMode": "Single", "ingress": {
                    "fqdn": "example.invalid", "external": True, "allowInsecure": False, "targetPort": 8000}},
                "template": {"containers": [{"image": config["image"], "env": config["runtimeEnvironment"]}],
                             "scale": {"minReplicas": 1, "maxReplicas": 1}},
            },
        }

        def azure(*args):
            if args[:2] == ("role", "assignment"):
                return []
            if args[1] == "show":
                return app
            if args[1] == "auth":
                return {}
            if args[1] == "revision":
                return [{"properties": {"active": True, "healthState": "Healthy",
                                        "runningState": "RunningAtMaxScale"}}]
            if args[1] == "replica":
                return [{"properties": {"runningState": "Running", "containers": [{
                    "ready": replica_ready, "started": True}]}}]
            self.fail(f"Unexpected Azure call: {args}")

        def http(url):
            if url.endswith(("/health", "/api/health")):
                return 200, "application/json", b'{"storage":"sqlite"}'
            if url.endswith("/api/state"):
                state = {k: [None] * n for k, n in {
                    "sites": 3, "lines": 6, "machines": 18, "incidents": 24, "telemetry": 72}.items()}
                state.update(ai={}, jobs=[])
                return 200, "application/json", json.dumps(state).encode()
            if "not-present" in url:
                return 404, "application/json", b"{}"
            if "/assets/" in url:
                return asset_status, "text/javascript" if url.endswith(".js") else "text/css", b"asset"
            return 200, "text/html", b'<script src="/assets/app.js"></script><link href="/assets/app.css">'

        evidence = {"registry": {"id": "registry"}}
        recorded = {}
        with patch.object(phase2, "load", side_effect=lambda p: config if p == phase2.CONFIG else evidence), \
                patch.object(phase2, "az", side_effect=azure), \
                patch.object(phase2, "get", side_effect=http), patch.object(phase2, "save"), \
                patch.object(phase2, "record", side_effect=lambda k, v: recorded.update({k: v})), \
                patch("builtins.print"):
            if asset_status != 200 or not replica_ready:
                with self.assertRaisesRegex(RuntimeError, "ReadinessNotVerified"):
                    phase2.verify()
            else:
                phase2.verify()
        return recorded["readiness"]

    def test_healthy_max_scale_revision_and_case_insensitive_identity(self):
        self.assertEqual(self.check_readiness()["status"], "verified_no_inference")

    def test_arm_success_does_not_hide_failed_asset_or_unready_replica(self):
        for kwargs in ({"asset_status": 503}, {"replica_ready": False}):
            with self.subTest(**kwargs):
                self.assertEqual(self.check_readiness(**kwargs)["status"], "failed")

    def test_identity_exec_targets_current_image_revision_not_stale_config(self):
        config = {"image": "registry/app@sha256:example", "revision": "stale"}
        app = {"properties": {"latestRevisionName": "current",
                              "template": {"containers": [{"image": config["image"]}]}}}
        result = SimpleNamespace(
            returncode=0, stdout='PHASE2_IDENTITY_RESULT={"status":"verified_managed_identity_definition_reads_no_inference"}')
        with patch.object(phase2, "load", return_value=config), patch.object(phase2, "az", return_value=app), \
                patch.object(phase2, "record"), patch.object(phase2, "save"), \
                patch.object(phase2, "cli_command", side_effect=lambda executable, args: args), \
                patch.object(phase2.subprocess, "run", return_value=result) as run, patch("builtins.print"):
            phase2.identity()
        args = run.call_args.args[0]
        self.assertEqual(args[args.index("--revision") + 1], "current")
        app["properties"]["template"]["containers"][0]["image"] = "different"
        with patch.object(phase2, "load", return_value=config), patch.object(phase2, "az", return_value=app):
            with self.assertRaisesRegex(RuntimeError, "RuntimeIdentityImageMismatch"):
                phase2.identity()


if __name__ == "__main__":
    unittest.main()
