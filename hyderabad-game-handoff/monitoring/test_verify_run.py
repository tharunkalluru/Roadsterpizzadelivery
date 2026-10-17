"""Synthetic validator tests. These are not game, geography, or phone tests.

Fixtures intentionally contain artificial claims and artifacts. Passing the
positive fixture proves ledger consistency only, never actual implementation.
"""

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("verify_run", HERE / "verify_run.py")
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class SyntheticLedger:
    """An explicitly artificial ledger, unconnected to the proposed game."""

    def __init__(self, root):
        self.root = root
        self.project = "synthetic-ledger-fixture-NOT-A-GAME"
        self.data = {}
        for target, template in (("qa/status.json", "status.template.json"),
                                 ("requirements.json", "requirements.template.json"),
                                 ("scope-manifest.json", "scope.template.json"),
                                 ("qa/evidence-index.json", "evidence-index.template.json")):
            self.data[target] = json.loads((HERE / template).read_text())
            self.data[target]["project_id"] = self.project
        self.status = self.data["qa/status.json"]
        self.scope = self.data["scope-manifest.json"]
        self.evidence = self.data["qa/evidence-index.json"]
        self.status.update({"run_id": "SYNTHETIC-ONLY", "phase": "synthetic-ledger-test",
                            "activity": "Validating artificial metadata, not a game",
                            "achieved_release": "completed_requested_network",
                            "code_revision": "SYNTHETIC-NOT-GIT", "blockers": [], "next_actions": []})
        self.data["config/project-contract.json"] = {
            "schema_version": 1, "project_id": self.project,
            "requested_release": "completed_requested_network", "simulation_hz": 60,
            "required_platforms": ["android", "ios"],
            "flight": {"model": "shared_per_contract", "default_budget_seconds": 25,
                       "allowed_budget_seconds": [20, 25, 30],
                       "regenerates_during_contract": False, "continuous_flight_allowed": True,
                       "split_flights_allowed": True, "per_burst_limit_seconds": None,
                       "airborne_phases_metered": ["takeoff", "travel", "hover", "descent"],
                       "reserve_is_within_budget": True, "intermediate_stop_refills": False,
                       "recovery_refunds": False},
        }
        self.write_text("dist/index.html", "<!doctype html><h1>NOT A GAME. SYNTHETIC LEDGER FIXTURE.</h1>")
        self.write_text("public/world/fixture.json", '{"synthetic":true,"actual_geography":false}')
        self.write_text("qa/synthetic-log.txt", "SYNTHETIC DATA. No game or device test was performed.\n")
        self.write_text("qa/synthetic-source.svg", '<svg xmlns="http://www.w3.org/2000/svg"><text>Artificial source</text></svg>')
        self.write_text("qa/synthetic-render.svg", '<svg xmlns="http://www.w3.org/2000/svg"><text>Artificial render</text></svg>')
        roads = [{"id": "road-" + line, "length_metres": 100,
                  "corridor_ids": [line], "source_refs": ["SYNTHETIC:NOT-OSM"],
                  "implemented": True, "geometry_verified": True}
                 for line in ("red", "blue", "green")]
        intervals = [{"id": road["id"] + "-" + side, "road_id": road["id"], "side": side,
                      "length_metres": 100, "inspection_status": "inspected", "inventory_complete": True}
                     for road in roads for side in ("left", "right")]
        self.scope.update({
            "frozen": True, "revision": "SYNTHETIC-001", "scope_extent": "requested_network",
            "source_snapshot_id": "SYNTHETIC-SOURCE", "reference_date": "2026-10-17",
            "roads": roads,
            "junctions": [{"id": "junction-001", "implemented": True, "verified": True}],
            "stations": [{"id": "station-" + line, "position_verified": True, "name_verified": True}
                         for line in ("red", "blue", "green")],
            "metro_structures": [{"id": "structure-001", "implemented": True, "verified": True}],
            "frontage_intervals": intervals,
            "businesses": [{"id": "business-001", "frontage_interval_id": intervals[0]["id"],
                            "name": "SYNTHETIC BUSINESS", "implemented": True, "identity_verified": True,
                            "placement_verified": True, "source_refs": ["SYNTHETIC"]}],
            "displayed_names": [{"id": "name-001", "name": "SYNTHETIC BUSINESS", "entity_id": "business-001",
                                 "entity_type": "business", "language": "en", "verified": True,
                                 "source_date": "2026-10-17", "source_refs": ["SYNTHETIC"]}],
            "delivery_locations": [{"id": "delivery-001", "verified_access": True}],
            "route_cases": [{"id": "route-001", "evidence_ids": ["ev-simulation_test", "ev-browser_test"]}],
            "review_views": [{"id": "view-001", "evidence_ids": ["ev-ai_visual_review"]}],
        })
        self.data["scope.geojson"] = {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "id": road["id"], "properties": {"synthetic": True},
                          "geometry": {"type": "LineString", "coordinates": [[0, index], [0.001, index]]}}
                         for index, road in enumerate(roads)],
        }
        self.save("scope.geojson")
        self.scope["geometry_artifact"] = self.artifact("scope.geojson")
        self.data["scope-baseline.json"] = {"schema_version": 1, "project_id": self.project,
            **{k: copy.deepcopy(v) for k, v in self.scope.items() if isinstance(v, list) and k != "requested_corridor_ids"}}
        self.save("scope-baseline.json")
        self.scope["baseline_artifact"] = self.artifact("scope-baseline.json")
        self.status["coverage"] = {
            "roads_total_metres": 300, "roads_implemented_metres": 300, "roads_verified_metres": 300,
            "frontage_total_metres": 600, "frontage_inspected_metres": 600,
            "business_inventory_complete": True, "businesses_inventoried": 1,
            "businesses_verified_and_implemented": 1, "displayed_names_total": 1,
            "displayed_names_verified": 1, "required_route_cases": 1, "passed_route_cases": 1,
            "required_review_views": 1, "passed_review_views": 1,
        }
        self.data["dist/build-manifest.json"] = {
            "schema_version": 1, "project_id": self.project, "kind": "production_build",
            "code_revision": "SYNTHETIC-NOT-GIT", "built_at": "2026-10-17T20:00:00Z",
            "entrypoint": "dist/index.html", "artifacts": [self.artifact("dist/index.html")],
        }
        self.data["public/world/world-manifest.json"] = {
            "schema_version": 1, "project_id": self.project, "kind": "world_manifest",
            "scope_sha256": None, "source_snapshot_id": "SYNTHETIC-SOURCE",
            "artifacts": [self.artifact("public/world/fixture.json")],
        }
        for evidence_class in sorted(VERIFIER.CLASSES):
            physical = evidence_class.startswith("physical_")
            record = {
                "id": "ev-" + evidence_class, "requirement_ids": list(VERIFIER.IDS),
                "scope_ids": ["route-001", "view-001"], "result": "passed",
                "evidence_class": evidence_class, "bindings": {},
                "started_at": "2026-10-17T20:00:00Z", "duration_seconds": 901,
                "command_or_method": "SYNTHETIC fixture generator; no actual game test",
                "expected": "Synthetic ledger meets structural rules",
                "observed": "Synthetic declarations only; not game evidence",
                "limitations": "Artificial fixture. No phone, real place, or game is involved.",
                "artifacts": [self.artifact("qa/synthetic-log.txt")],
                "environment": {"device_class": evidence_class.removeprefix("physical_") if physical else "synthetic",
                                "physical_device": physical, "device_model": "SYNTHETIC MODEL",
                                "os": "SYNTHETIC OS", "browser": "SYNTHETIC BROWSER"},
            }
            if evidence_class in {"ai_visual_review", "local_field_review"}:
                record["comparison"] = {"view_id": "view-001", "source_date": "2026-10-17",
                                        "reviewed_properties": ["synthetic metadata only"],
                                        "source_artifact": self.artifact("qa/synthetic-source.svg"),
                                        "game_screenshot_artifact": self.artifact("qa/synthetic-render.svg")}
            if evidence_class in {"local_field_review", "release_review"}:
                record["reviewer"] = {"kind": "human_local" if evidence_class == "local_field_review" else "same_agent_adversarial_pass",
                                      "name": "SYNTHETIC DECLARATION, NOT AN ACTUAL REVIEWER"}
            self.evidence["records"].append(record)
        for check in self.status["checks"]:
            check.update({"result": "passed", "evidence_ids": [r["id"] for r in self.evidence["records"]]})
        for gate in self.status["gates"]:
            gate["result"] = "passed"
        self.refresh()

    def write_text(self, relative, text):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def save(self, relative):
        self.write_text(relative, json.dumps(self.data[relative], indent=2) + "\n")

    def artifact(self, relative):
        return {"path": relative, "sha256": VERIFIER.sha256(self.root / relative)}

    def refresh(self):
        """Rebind artificial fixture after a deliberate metadata mutation."""
        for path in ("requirements.json", "scope-manifest.json", "config/project-contract.json"):
            self.save(path)
        self.data["public/world/world-manifest.json"]["scope_sha256"] = VERIFIER.sha256(self.root / "scope-manifest.json")
        self.save("public/world/world-manifest.json")
        self.save("dist/build-manifest.json")
        for name, binding in self.status["bindings"].items():
            binding["sha256"] = VERIFIER.sha256(self.root / binding["path"])
        hashes = {k: v["sha256"] for k, v in self.status["bindings"].items()}
        for record in self.evidence["records"]:
            record["bindings"] = dict(hashes)
        self.save("qa/evidence-index.json")
        self.save("qa/status.json")

    def run(self, release=True):
        validator = VERIFIER.Validator(self.root, release)
        return validator.run("qa/status.json", "requirements.json", "scope-manifest.json", "qa/evidence-index.json")


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="synthetic-ledger-tests-")
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.fixture = SyntheticLedger(self.root)

    def assertRejects(self, expected_code):
        report, exit_code = self.fixture.run()
        self.assertNotEqual(exit_code, 0)
        self.assertFalse(report["ready_for_requested_release"])
        self.assertIn(expected_code, {i["code"] for i in report["issues"]}, report["issues"])

    def test_valid_synthetic_ledger_only(self):
        report, code = self.fixture.run()
        self.assertEqual(code, 0, report["issues"])
        self.assertTrue(report["valid_ledger"])
        self.assertEqual(report["requirement_results"]["passed"], 82)
        self.assertIn("cannot prove", report["limitations"])

    def test_template_report_incomplete_but_valid(self):
        with tempfile.TemporaryDirectory(prefix="empty-ledger-template-") as directory:
            target = Path(directory)
            for template, filename in (("status.template.json", "qa/status.json"),
                                       ("requirements.template.json", "requirements.json"),
                                       ("scope.template.json", "scope-manifest.json"),
                                       ("evidence-index.template.json", "qa/evidence-index.json")):
                path = target / filename
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((HERE / template).read_bytes())
            args = ("qa/status.json", "requirements.json", "scope-manifest.json", "qa/evidence-index.json")
            report, code = VERIFIER.Validator(target).run(*args)
            self.assertEqual(code, 0, report["issues"])
            self.assertTrue(report["valid_ledger"])
            self.assertFalse(report["ready_for_requested_release"])
            self.assertEqual(report["requirement_results"]["not_run"], 82)
            self.assertEqual(VERIFIER.Validator(target, release=True).run(*args)[1], 1)

    def test_missing_artifact_rejected(self):
        (self.root / "qa/synthetic-log.txt").unlink()
        self.assertRejects("missing_artifact")

    def test_forged_artifact_hash_rejected(self):
        self.fixture.write_text("qa/synthetic-log.txt", "changed without rehash")
        self.assertRejects("hash_mismatch")

    def test_stale_build_binding_rejected(self):
        self.fixture.evidence["records"][0]["bindings"]["build"] = "0" * 64
        self.fixture.save("qa/evidence-index.json")
        self.assertRejects("stale_evidence")

    def test_stale_config_binding_rejected(self):
        self.fixture.evidence["records"][0]["bindings"]["config"] = "0" * 64
        self.fixture.save("qa/evidence-index.json")
        self.assertRejects("stale_evidence")

    def test_stale_world_scope_and_requirements_bindings_rejected(self):
        for name in ("world", "scope", "requirements"):
            with self.subTest(binding=name):
                self.fixture.refresh()
                self.fixture.evidence["records"][0]["bindings"][name] = "0" * 64
                self.fixture.save("qa/evidence-index.json")
                self.assertRejects("stale_evidence")

    def test_changed_bundle_file_rejected(self):
        self.fixture.write_text("dist/index.html", "a later production bundle")
        self.assertRejects("hash_mismatch")

    def test_unknown_storefront_inventory_cannot_pass(self):
        interval = self.fixture.scope["frontage_intervals"][0]
        interval.update({"inspection_status": "uninspected", "inventory_complete": False})
        self.fixture.status["coverage"].update({"frontage_inspected_metres": 500, "business_inventory_complete": False})
        self.fixture.refresh()
        self.assertRejects("unknown_business_denominator")

    def test_false_storefront_percentage_rejected(self):
        self.fixture.status["coverage"]["businesses_verified_and_implemented"] = 999
        self.fixture.save("qa/status.json")
        self.assertRejects("coverage_mismatch")

    def test_removed_road_denominator_rejected(self):
        self.fixture.scope["roads"].pop()
        self.fixture.refresh()
        self.assertRejects("scope_inventory_changed")

    def test_parent_traversal_rejected(self):
        self.fixture.evidence["records"][0]["artifacts"][0]["path"] = "../outside.txt"
        self.fixture.save("qa/evidence-index.json")
        self.assertRejects("unsafe_path")

    def test_absolute_path_rejected(self):
        self.fixture.evidence["records"][0]["artifacts"][0]["path"] = "/etc/passwd"
        self.fixture.save("qa/evidence-index.json")
        self.assertRejects("unsafe_path")

    def test_symlink_escape_rejected(self):
        with tempfile.TemporaryDirectory(prefix="outside-ledger-root-") as directory:
            outside = Path(directory) / "outside.txt"
            outside.write_text("outside")
            (self.root / "qa/escape.txt").symlink_to(outside)
            record = self.fixture.evidence["records"][0]
            record["artifacts"] = [{"path": "qa/escape.txt", "sha256": VERIFIER.sha256(outside)}]
            self.fixture.save("qa/evidence-index.json")
            self.assertRejects("unsafe_path")

    def test_pending_failed_blocked_and_stale_evidence_never_count_as_pass(self):
        for result in ("not_run", "failed", "blocked", "stale"):
            with self.subTest(result=result):
                self.fixture.evidence["records"][0]["result"] = result
                self.fixture.save("qa/evidence-index.json")
                self.assertRejects("unsupported_pass")

    def test_phone_emulation_cannot_satisfy_physical_phone_claim(self):
        for record in self.fixture.evidence["records"]:
            if record["evidence_class"] == "physical_android":
                record["environment"]["physical_device"] = False
        self.fixture.save("qa/evidence-index.json")
        self.assertRejects("physical_evidence")

    def test_required_mobile_platform_cannot_be_removed_with_its_evidence(self):
        original_records = copy.deepcopy(self.fixture.evidence["records"])
        original_checks = copy.deepcopy(self.fixture.status["checks"])
        for removed in ("android", "ios"):
            with self.subTest(removed_platform=removed):
                self.fixture.data["config/project-contract.json"]["required_platforms"] = [
                    platform for platform in ("android", "ios") if platform != removed
                ]
                removed_ids = {
                    record["id"] for record in original_records
                    if record["evidence_class"] == "physical_" + removed
                }
                self.fixture.evidence["records"] = [
                    copy.deepcopy(record) for record in original_records
                    if record["id"] not in removed_ids
                ]
                self.fixture.status["checks"] = copy.deepcopy(original_checks)
                for check in self.fixture.status["checks"]:
                    check["evidence_ids"] = [
                        reference for reference in check["evidence_ids"]
                        if reference not in removed_ids
                    ]
                self.fixture.refresh()
                self.assertRejects("platforms")

    def test_duplicate_unknown_or_malformed_mobile_platform_rejected(self):
        for platforms in (["android", "android"], ["android", "ios", "ios"],
                          ["android", "windows"], ["android", {"platform": "ios"}]):
            with self.subTest(platforms=platforms):
                self.fixture.data["config/project-contract.json"]["required_platforms"] = platforms
                self.fixture.refresh()
                self.assertRejects("platforms")

    def test_required_mobile_platform_order_is_irrelevant(self):
        self.fixture.data["config/project-contract.json"]["required_platforms"] = ["ios", "android"]
        self.fixture.refresh()
        report, code = self.fixture.run()
        self.assertEqual(code, 0, report["issues"])

    def test_short_phone_run_rejected(self):
        for record in self.fixture.evidence["records"]:
            if record["evidence_class"] == "physical_android":
                record["duration_seconds"] = 899
        self.fixture.save("qa/evidence-index.json")
        self.assertRejects("short_phone_run")

    def test_visual_pass_requires_both_comparison_files(self):
        (self.root / "qa/synthetic-render.svg").unlink()
        self.assertRejects("missing_artifact")

    def test_regeneration_and_burst_cap_rejected(self):
        flight = self.fixture.data["config/project-contract.json"]["flight"]
        flight["regenerates_during_contract"] = True
        flight["per_burst_limit_seconds"] = 4
        self.fixture.refresh()
        self.assertRejects("flight_contract")

    def test_legacy_recharge_alias_rejected(self):
        self.fixture.data["config/project-contract.json"]["flight"]["ground_recharge_seconds"] = 12
        self.fixture.refresh()
        self.assertRejects("legacy_flight_model")

    def test_braking_and_coasting_metered_aliases_accepted(self):
        self.fixture.data["config/project-contract.json"]["flight"]["airborne_phases_metered"] += ["braking", "coasting"]
        self.fixture.refresh()
        report, code = self.fixture.run()
        self.assertEqual(code, 0, report["issues"])

    def test_required_check_cannot_be_removed(self):
        self.fixture.status["checks"].pop()
        self.fixture.save("qa/status.json")
        self.assertRejects("missing_ids")

    def test_required_policy_cannot_be_weakened(self):
        self.fixture.data["requirements.json"]["requirements"][0]["mandatory"] = False
        self.fixture.refresh()
        self.assertRejects("weakened_requirement")

    def test_true_is_not_a_numeric_coverage_value(self):
        self.fixture.status["coverage"]["roads_total_metres"] = True
        self.fixture.save("qa/status.json")
        self.assertRejects("coverage_mismatch")

    def test_malformed_nested_type_fails_closed_without_crashing(self):
        self.fixture.evidence["records"][0]["result"] = {"not": "a result enum"}
        self.fixture.save("qa/evidence-index.json")
        self.assertRejects("malformed_metadata")

    def test_missing_evidence_reference_rejected(self):
        self.fixture.status["checks"][0]["evidence_ids"] = ["invented-evidence-id"]
        self.fixture.save("qa/status.json")
        self.assertRejects("missing_evidence")

    def test_artifactless_pass_rejected(self):
        self.fixture.evidence["records"][0]["artifacts"] = []
        self.fixture.save("qa/evidence-index.json")
        self.assertRejects("artifactless_pass")

    def test_passed_gate_with_pending_requirement_rejected(self):
        self.fixture.status["checks"][0]["result"] = "not_run"
        self.fixture.save("qa/status.json")
        self.assertRejects("unsupported_gate")

    def test_cli_is_read_only_and_outputs_json(self):
        before = {str(p.relative_to(self.root)): VERIFIER.sha256(p) for p in self.root.rglob("*") if p.is_file()}
        result = subprocess.run([sys.executable, str(HERE / "verify_run.py"), "--root", str(self.root), "--release"],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertTrue(json.loads(result.stdout)["ready_for_requested_release"])
        after = {str(p.relative_to(self.root)): VERIFIER.sha256(p) for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main(verbosity=2)
