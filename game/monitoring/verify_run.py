#!/usr/bin/env python3
"""Read-only integrity and readiness checks for a game implementation ledger.

This validates declared evidence and file integrity. It cannot establish that a
real phone was used, that a screenshot is authentic, or that geography is true.
Only Python's standard library is used. No files or network state are changed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path, PurePosixPath

SCHEMA_VERSION = 1
RESULTS = {"passed", "failed", "blocked", "not_run", "stale"}
RELEASES = {
    "development_fixture", "playable_authentic_slice",
    "playable_corridor_with_gaps", "geographically_verified_corridor",
    "mobile_validated_verified_corridor", "completed_requested_network",
}
BINDINGS = ("build", "world", "config", "scope", "requirements")
GATES = tuple("C" + str(n) for n in range(8))
IDS = tuple(prefix + f"{n:02}" for prefix, count in
            (("G", 12), ("F", 24), ("M", 14), ("U", 12), ("P", 8), ("Q", 12))
            for n in range(1, count + 1))
CLASSES = {
    "simulation_test", "browser_test", "mobile_emulation", "physical_android",
    "physical_ios", "source_inspection", "ai_visual_review", "local_field_review",
    "build_check", "asset_audit", "release_review",
}
PHYSICAL = {"physical_android": "android", "physical_ios": "ios"}
HEX = re.compile(r"^[a-f0-9]{64}$")


def evidence_policy(requirement_id):
    """Groups are ANDed; at least one class in each group is required."""
    prefix = requirement_id[0]
    groups = [["simulation_test", "browser_test"]]
    gate = "C2"
    physical_platforms = False
    minimum_duration_seconds = 0
    if prefix == "G":
        groups, gate = [["source_inspection"]], "C1"
    elif prefix == "F":
        gate = "C3"
    elif prefix == "U":
        groups, gate = [["browser_test", "physical_android", "physical_ios"]], "C6"
    elif prefix == "P":
        groups, gate = [["build_check", "browser_test"]], "C7"
    elif prefix == "Q":
        groups, gate = [["release_review", "asset_audit"]], "C7"
    if requirement_id in {"G02", "G03", "G08", "G11"}:
        groups = [["source_inspection"], ["simulation_test", "browser_test"]]
        gate = "C5"
    if requirement_id in {"G04", "G05"}:
        groups = [["source_inspection"], ["ai_visual_review", "local_field_review"]]
        gate = "C4"
    if requirement_id == "G10":
        groups, gate = [["asset_audit"]], "C0"
    if requirement_id == "G12":
        groups, gate = [["local_field_review"]], "C4"
    if requirement_id == "M01":
        groups = [["browser_test"]]
    if requirement_id == "M04":
        gate = "C5"
    if requirement_id in {"U01", "U03", "U04", "P03"}:
        groups, gate = [["physical_android", "physical_ios"]], "C6"
        physical_platforms = True
    if requirement_id in {"P02", "P04", "P05", "P06"}:
        groups, gate = [["browser_test", "physical_android", "physical_ios"]], "C6"
    if requirement_id == "P03":
        minimum_duration_seconds = 900
    if requirement_id in {"P07", "Q07"}:
        groups = [["asset_audit"]]
    if requirement_id in {"Q01", "Q02", "Q03", "Q04"}:
        groups, gate = [["source_inspection", "asset_audit"]], "C5"
    if requirement_id == "Q08":
        groups, gate = [["source_inspection"], ["ai_visual_review", "local_field_review"]], "C4"
    if requirement_id in {"Q10", "Q11"}:
        gate = "C0"
    return {
        "groups": groups, "gate": gate,
        "physical_platforms": physical_platforms,
        "minimum_duration_seconds": minimum_duration_seconds,
    }


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()


class Validator:
    def __init__(self, root, release=False):
        self.root = Path(root).resolve()
        self.release = release
        self.issues = []
        self.current_hashes = {}
        self.check_results = {}
        self.evidence = {}
        self.good_evidence = set()
        self.summary = {}

    def issue(self, code, message, severity="error"):
        self.issues.append({"severity": severity, "code": code, "message": message})

    def block(self, code, message):
        self.issue(code, message, "blocker")

    def obj(self, value, where):
        if not isinstance(value, dict):
            self.issue("type", f"{where} must be an object")
            return {}
        return value

    def arr(self, value, where):
        if not isinstance(value, list):
            self.issue("type", f"{where} must be an array")
            return []
        return value

    def string(self, value, where, allow_null=False):
        if allow_null and value is None:
            return None
        if not isinstance(value, str) or not value.strip():
            self.issue("type", f"{where} must be a nonempty string")
            return None
        return value

    def boolean(self, value, where):
        if type(value) is not bool:
            self.issue("type", f"{where} must be a boolean")
            return False
        return value

    def strings(self, value, where):
        items = self.arr(value, where)
        for index, item in enumerate(items):
            self.string(item, f"{where}[{index}]")
        return items

    def number(self, value, where, allow_null=False, positive=False):
        if allow_null and value is None:
            return None
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0 or (positive and value <= 0):
            self.issue("type", f"{where} must be a finite {'positive' if positive else 'nonnegative'} number")
            return None
        return value

    def timestamp(self, value, where):
        if self.string(value, where) is None:
            return
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError("timezone missing")
        except ValueError:
            self.issue("timestamp", f"{where} must be an ISO timestamp with a timezone")

    def safe_path(self, value, where, must_exist=True, missing_blocker=False):
        if self.string(value, where) is None:
            return None
        candidate = PurePosixPath(value)
        if candidate.is_absolute() or ".." in candidate.parts or "\\" in value or ":" in value:
            self.issue("unsafe_path", f"{where}: use a relative POSIX path inside the project root")
            return None
        try:
            actual = (self.root / value).resolve()
            actual.relative_to(self.root)
        except (ValueError, OSError, RuntimeError):
            self.issue("unsafe_path", f"{where} resolves outside the project root or contains a bad link")
            return None
        if must_exist and not actual.is_file():
            self.issue("missing_artifact", f"{where}: file does not exist: {value}",
                       "blocker" if missing_blocker else "error")
            return None
        return actual

    def artifact(self, value, where, allow_unbuilt=False):
        entry = self.obj(value, where)
        declared = entry.get("sha256")
        if declared is None and allow_unbuilt:
            self.safe_path(entry.get("path"), where + ".path", must_exist=False)
            self.block("unbuilt_binding", f"{where} has no current hash")
            return None
        if not isinstance(declared, str) or not HEX.fullmatch(declared):
            self.issue("hash_format", f"{where}.sha256 must be lowercase SHA-256")
            return None
        path = self.safe_path(entry.get("path"), where + ".path")
        if path is None:
            return None
        try:
            actual = sha256(path)
        except OSError as exc:
            self.issue("read_error", f"{where}: {exc}")
            return None
        if actual != declared:
            self.issue("hash_mismatch", f"{where}: file content differs from its recorded hash")
            return None
        return path

    def read_json(self, path, where):
        try:
            if path.stat().st_size > 16 * 1024 * 1024:
                raise ValueError("metadata exceeds 16 MiB")
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, ValueError) as exc:
            self.issue("invalid_json", f"{where}: {exc}")
            return {}
        return self.obj(data, where)

    def load(self, path, where):
        actual = self.safe_path(path, where)
        return (self.read_json(actual, where), actual) if actual else ({}, None)

    def header(self, value, where):
        if type(value.get("schema_version")) is not int or value.get("schema_version") != 1:
            self.issue("schema", f"{where}.schema_version must be integer 1")
        self.string(value.get("project_id"), where + ".project_id")

    def indexed(self, value, where, allowed_ids=None):
        result = {}
        for index, entry in enumerate(self.arr(value, where)):
            item = self.obj(entry, f"{where}[{index}]")
            item_id = self.string(item.get("id"), f"{where}[{index}].id")
            if item_id is None:
                continue
            if item_id in result:
                self.issue("duplicate_id", f"{where} duplicates {item_id}")
            if allowed_ids is not None and item_id not in allowed_ids:
                self.issue("unknown_id", f"{where} has unknown ID {item_id}")
            result[item_id] = item
        if allowed_ids is not None and set(result) != set(allowed_ids):
            self.issue("missing_ids", f"{where} must contain exactly the required IDs; missing {sorted(set(allowed_ids) - set(result))}")
        return result

    def validate_config(self, config, status):
        self.header(config, "config")
        if config.get("requested_release") != status.get("requested_release"):
            self.issue("config_scope", "config and status requested_release differ")
        if config.get("simulation_hz") != 60 or type(config.get("simulation_hz")) is not int:
            self.issue("flight_contract", "simulation_hz must be 60")
        flight = self.obj(config.get("flight"), "config.flight")
        required = {
            "model": "shared_per_contract", "default_budget_seconds": 25,
            "allowed_budget_seconds": [20, 25, 30],
            "regenerates_during_contract": False, "continuous_flight_allowed": True,
            "split_flights_allowed": True, "per_burst_limit_seconds": None,
            "reserve_is_within_budget": True, "intermediate_stop_refills": False,
            "recovery_refunds": False,
        }
        for key, expected in required.items():
            if key not in flight or flight[key] != expected or type(flight[key]) is not type(expected):
                self.issue("flight_contract", f"config.flight.{key} must equal {expected!r}")
        phases = flight.get("airborne_phases_metered")
        required_phases = {"takeoff", "travel", "hover", "descent"}
        allowed_phases = required_phases | {"braking", "coasting"}
        if (not isinstance(phases, list) or not required_phases.issubset(set(str(x) for x in phases))
                or not set(str(x) for x in phases).issubset(allowed_phases)
                or len(set(str(x) for x in phases)) != len(phases)):
            self.issue("flight_contract", "Every active airborne phase must be metered")
        # Reject common legacy aliases even if the required canonical keys look right.
        for key, value in flight.items():
            normalized = key.lower()
            legacy = any(part in normalized for part in ("recharge", "refill", "cooldown", "regeneration", "per_launch", "max_burst"))
            if legacy and value not in (None, False, 0):
                self.issue("legacy_flight_model", f"Remove obsolete flight setting {key}")
        platforms = self.arr(config.get("required_platforms"), "config.required_platforms")
        required_platforms = {"android", "ios"}
        if (len(platforms) != len(required_platforms)
                or any(not isinstance(p, str) or p not in required_platforms for p in platforms)
                or set(platforms) != required_platforms):
            self.issue("platforms", "required_platforms must contain android and ios exactly once; the supplied contract requires both platforms")
        return platforms

    def validate_manifest(self, value, kind, status):
        self.header(value, kind)
        if value.get("kind") != ("production_build" if kind == "build" else "world_manifest"):
            self.issue("manifest_kind", f"{kind} manifest has the wrong kind")
        files = self.arr(value.get("artifacts"), kind + ".artifacts")
        if not files:
            self.block("empty_manifest", f"{kind} manifest has no packaged artifacts")
        seen = set()
        for index, item in enumerate(files):
            entry = self.obj(item, f"{kind}.artifacts[{index}]")
            path = entry.get("path")
            if isinstance(path, str):
                if path in seen:
                    self.issue("duplicate_artifact", f"{kind} repeats artifact {path}")
                seen.add(path)
            self.artifact(entry, f"{kind}.artifacts[{index}]")
        if kind == "build":
            self.timestamp(value.get("built_at"), "build.built_at")
            if value.get("code_revision") != status.get("code_revision"):
                self.issue("stale_code_revision", "Build and status code revisions differ")
            if value.get("entrypoint") not in seen:
                self.issue("build_entrypoint", "Build entrypoint must be present in its artifact inventory")
        elif value.get("scope_sha256") != self.current_hashes.get("scope"):
            self.issue("stale_world_scope", "World manifest is not bound to the current scope hash")

    def validate_evidence(self, index):
        self.evidence = self.indexed(index.get("records"), "evidence.records")
        for item_id, item in self.evidence.items():
            where = "evidence." + item_id
            before = len(self.issues)
            result = item.get("result")
            if result not in RESULTS:
                self.issue("result", f"{where}.result is invalid")
            evidence_class = item.get("evidence_class")
            if evidence_class not in CLASSES:
                self.issue("evidence_class", f"{where}.evidence_class is invalid")
            requirement_ids = self.arr(item.get("requirement_ids"), where + ".requirement_ids")
            if not requirement_ids or any(not isinstance(r, str) or r not in IDS for r in requirement_ids):
                self.issue("evidence_requirement", f"{where} must identify real acceptance IDs")
            for scope_id in self.arr(item.get("scope_ids"), where + ".scope_ids"):
                self.string(scope_id, where + ".scope_ids[]")
            artifacts = self.arr(item.get("artifacts"), where + ".artifacts")
            for n, artifact in enumerate(artifacts):
                self.artifact(artifact, f"{where}.artifacts[{n}]")
            if result != "passed":
                continue
            if not artifacts:
                self.issue("artifactless_pass", f"{where} cannot pass without evidence files")
            hashes = self.obj(item.get("bindings"), where + ".bindings")
            for name in BINDINGS:
                if not self.current_hashes.get(name) or hashes.get(name) != self.current_hashes.get(name):
                    self.issue("stale_evidence", f"{where} does not match current {name} hash")
            self.timestamp(item.get("started_at"), where + ".started_at")
            self.number(item.get("duration_seconds"), where + ".duration_seconds", positive=True)
            for name in ("command_or_method", "expected", "observed", "limitations"):
                self.string(item.get(name), where + "." + name)
            environment = self.obj(item.get("environment"), where + ".environment")
            self.string(environment.get("device_class"), where + ".environment.device_class")
            physical = self.boolean(environment.get("physical_device"), where + ".environment.physical_device")
            if evidence_class in PHYSICAL:
                if physical is not True or environment.get("device_class") != PHYSICAL[evidence_class]:
                    self.issue("physical_evidence", f"{where} is mislabeled as a physical phone test")
                for field in ("device_model", "os", "browser"):
                    self.string(environment.get(field), where + ".environment." + field)
            elif evidence_class == "mobile_emulation" and physical:
                self.issue("emulation_evidence", f"{where} cannot be both emulation and a physical test")
            if evidence_class == "local_field_review":
                reviewer = self.obj(item.get("reviewer"), where + ".reviewer")
                if reviewer.get("kind") != "human_local":
                    self.issue("local_review", f"{where} requires a declared human local reviewer")
                self.string(reviewer.get("name"), where + ".reviewer.name")
            if evidence_class in {"ai_visual_review", "local_field_review"}:
                comparison = self.obj(item.get("comparison"), where + ".comparison")
                self.string(comparison.get("view_id"), where + ".comparison.view_id")
                self.string(comparison.get("source_date"), where + ".comparison.source_date")
                props = self.arr(comparison.get("reviewed_properties"), where + ".comparison.reviewed_properties")
                if not props or any(not isinstance(p, str) or not p for p in props):
                    self.issue("visual_properties", f"{where} needs actual comparison properties")
                for field in ("source_artifact", "game_screenshot_artifact"):
                    self.artifact(comparison.get(field), where + ".comparison." + field)
            if evidence_class == "release_review":
                reviewer = self.obj(item.get("reviewer"), where + ".reviewer")
                if reviewer.get("kind") not in {"independent_agent", "human", "same_agent_adversarial_pass"}:
                    self.issue("release_reviewer", f"{where} must state its actual review method")
                self.string(reviewer.get("name"), where + ".reviewer.name")
            if len(self.issues) == before:
                self.good_evidence.add(item_id)

    def validate_checks(self, status, requirements, platforms):
        requirement_map = self.indexed(requirements.get("requirements"), "requirements.requirements", IDS)
        for item_id, item in requirement_map.items():
            self.string(item.get("description"), "requirements." + item_id + ".description")
            if item.get("mandatory") is not True:
                self.issue("weakened_requirement", f"{item_id} must remain mandatory for the requested final release")
            if item.get("evidence_policy") != evidence_policy(item_id):
                self.issue("weakened_policy", f"{item_id} evidence policy differs from the supplied checker contract")
        checks = self.indexed(status.get("checks"), "status.checks", IDS)
        for item_id, item in checks.items():
            result = item.get("result")
            if result not in RESULTS:
                self.issue("result", f"status.checks.{item_id}.result is invalid")
            references = self.arr(item.get("evidence_ids"), "checks." + item_id + ".evidence_ids")
            linked = []
            for reference in references:
                if not isinstance(reference, str) or reference not in self.evidence:
                    self.issue("missing_evidence", f"{item_id} refers to nonexistent evidence {reference!r}")
                else:
                    linked.append(self.evidence[reference])
            if result != "passed":
                self.check_results[item_id] = result
                continue
            before = len(self.issues)
            if not references:
                self.issue("unsupported_pass", f"{item_id} has no evidence")
            for record in linked:
                if record["id"] not in self.good_evidence or item_id not in record.get("requirement_ids", []):
                    self.issue("unsupported_pass", f"{item_id} references nonpassing, stale, invalid, or unrelated evidence {record['id']}")
            policy = evidence_policy(item_id)
            classes = {r.get("evidence_class") for r in linked if r["id"] in self.good_evidence}
            for group in policy["groups"]:
                if not classes.intersection(group):
                    self.issue("insufficient_method", f"{item_id} requires one of {group}")
            if policy["physical_platforms"]:
                for platform in platforms:
                    matching = [r for r in linked if r.get("evidence_class") == "physical_" + str(platform) and r["id"] in self.good_evidence]
                    if not matching:
                        self.issue("missing_phone_evidence", f"{item_id} lacks physical {platform} evidence")
                    elif policy["minimum_duration_seconds"] and not any(
                        type(r.get("duration_seconds")) in (int, float) and
                        r["duration_seconds"] >= policy["minimum_duration_seconds"] for r in matching
                    ):
                        self.issue("short_phone_run", f"{item_id} lacks a sustained {platform} run of at least 900 seconds")
            self.check_results[item_id] = "passed" if len(self.issues) == before else "invalid_pass"
        for item_id in IDS:
            if self.check_results.get(item_id) != "passed":
                self.block("check_incomplete", f"{item_id}: {self.check_results.get(item_id, 'missing')}")
        gates = self.indexed(status.get("gates"), "status.gates", GATES)
        for gate_id, item in gates.items():
            result = item.get("result")
            if result not in RESULTS:
                self.issue("result", f"{gate_id}.result is invalid")
            if result == "passed":
                dependent = [r for r in IDS if evidence_policy(r)["gate"] == gate_id]
                if gate_id == "C7":
                    dependent = list(IDS)
                incomplete = [r for r in dependent if self.check_results.get(r) != "passed"]
                if incomplete:
                    self.issue("unsupported_gate", f"{gate_id} passed with incomplete requirements: {incomplete}")
            else:
                self.block("gate_incomplete", f"{gate_id}: {result}")

    def validate_scope(self, scope, status):
        self.boolean(scope.get("frozen"), "scope.frozen")
        if not scope.get("frozen"):
            self.block("scope_not_frozen", "Scope must be frozen before a final release claim")
        self.string(scope.get("revision"), "scope.revision")
        if scope.get("scope_extent") != "requested_network":
            self.block("scope_extent", "The frozen achieved scope does not contain the requested network")
        lines = self.arr(scope.get("requested_corridor_ids"), "scope.requested_corridor_ids")
        if set(str(x) for x in lines) != {"red", "blue", "green"} or len(lines) != 3:
            self.issue("requested_scope_changed", "Requested corridor IDs must preserve red, blue, and green")
        for field in ("source_snapshot_id", "reference_date"):
            if scope.get(field) is None:
                self.block("source_snapshot_missing", f"scope.{field} is unknown")
            else:
                self.string(scope[field], "scope." + field)
        tables = {}
        for table in ("roads", "junctions", "stations", "metro_structures", "frontage_intervals",
                      "businesses", "displayed_names", "delivery_locations", "route_cases", "review_views"):
            tables[table] = self.indexed(scope.get(table), "scope." + table)
        baseline = scope.get("baseline_artifact")
        if baseline is None:
            self.block("scope_baseline_missing", "Preserve an inventory baseline artifact before declaring the scope frozen")
        else:
            baseline_path = self.artifact(baseline, "scope.baseline_artifact")
            if baseline_path:
                initial = self.read_json(baseline_path, "scope baseline")
                self.header(initial, "scope baseline")
                if initial.get("project_id") != scope.get("project_id"):
                    self.issue("project_mismatch", "Scope baseline belongs to another project")
                for table in tables:
                    previous = self.indexed(initial.get(table), "baseline." + table)
                    if set(previous) != set(tables[table]):
                        self.issue("scope_inventory_changed", f"{table} IDs differ from the frozen baseline; record an explicit revised baseline and review it")
                    for item_id in set(previous).intersection(tables[table]):
                        for field in (("length_metres", "corridor_ids") if table == "roads" else
                                      ("length_metres", "road_id", "side") if table == "frontage_intervals" else ()):
                            if previous[item_id].get(field) != tables[table][item_id].get(field):
                                self.issue("scope_extent_changed", f"{table}.{item_id}.{field} differs from the frozen baseline")
        roads = tables["roads"]
        total = implemented = verified = 0
        road_lines = set()
        for item_id, road in roads.items():
            length = self.number(road.get("length_metres"), item_id + ".length_metres", positive=True) or 0
            total += length
            implemented += length if self.boolean(road.get("implemented"), item_id + ".implemented") else 0
            verified += length if self.boolean(road.get("geometry_verified"), item_id + ".geometry_verified") else 0
            line_ids = self.arr(road.get("corridor_ids"), item_id + ".corridor_ids")
            if not line_ids or any(x not in {"red", "blue", "green"} for x in line_ids):
                self.issue("road_corridors", f"{item_id} has invalid corridor IDs")
            road_lines.update(str(x) for x in line_ids)
            source_refs = self.strings(road.get("source_refs"), item_id + ".source_refs")
            if not source_refs:
                self.block("road_source_missing", f"{item_id} has no source reference")
        if road_lines != {"red", "blue", "green"}:
            self.block("network_incomplete", "Road inventory does not cover all three requested corridors")
        if not roads:
            self.block("empty_scope", "No physical roads have been frozen into the scope")
        if total != implemented or total != verified:
            self.block("road_coverage", "Selected physical roads are not all implemented and verified")
        intervals = tables["frontage_intervals"]
        frontage_total = frontage_inspected = 0
        for item_id, item in intervals.items():
            length = self.number(item.get("length_metres"), item_id + ".length_metres", positive=True) or 0
            frontage_total += length
            if item.get("road_id") not in roads:
                self.issue("scope_reference", f"{item_id} refers to an unknown road")
            if item.get("side") not in {"left", "right"}:
                self.issue("frontage_side", f"{item_id}.side must be left or right")
            if item.get("inspection_status") not in {"uninspected", "partial", "inspected"}:
                self.issue("frontage_status", f"{item_id}.inspection_status is invalid")
            complete = self.boolean(item.get("inventory_complete"), item_id + ".inventory_complete")
            if item.get("inspection_status") == "inspected" and complete:
                frontage_inspected += length
            elif complete:
                self.issue("false_inventory", f"{item_id} cannot have a complete inventory without inspection")
        inventory_complete = bool(intervals) and frontage_total == frontage_inspected
        if not inventory_complete:
            self.block("unknown_business_denominator", "Business completeness is unknown until all frozen frontage intervals are inspected and inventoried")
        businesses_verified = 0
        for item_id, item in tables["businesses"].items():
            if item.get("frontage_interval_id") not in intervals:
                self.issue("scope_reference", f"{item_id} refers to an unknown frontage interval")
            flags = [self.boolean(item.get(k), item_id + "." + k) for k in
                     ("implemented", "identity_verified", "placement_verified")]
            if all(flags):
                self.string(item.get("name"), item_id + ".name")
                if not self.strings(item.get("source_refs"), item_id + ".source_refs"):
                    self.issue("business_evidence", f"{item_id} is verified without a source")
                businesses_verified += 1
        if businesses_verified != len(tables["businesses"]):
            self.block("business_gaps", "Some inventoried businesses have unresolved identity, placement, or implementation")
        names_verified = 0
        for item_id, item in tables["displayed_names"].items():
            for field in ("name", "language", "entity_id", "entity_type"):
                self.string(item.get(field), item_id + "." + field)
            if self.boolean(item.get("verified"), item_id + ".verified"):
                self.string(item.get("source_date"), item_id + ".source_date")
                if not self.strings(item.get("source_refs"), item_id + ".source_refs"):
                    self.issue("name_evidence", f"{item_id} has no source for its verified name")
                names_verified += 1
        if names_verified != len(tables["displayed_names"]):
            self.block("unverified_names", "Some displayed real-world names are unverified")
        for table, flags in (("junctions", ("implemented", "verified")),
                             ("stations", ("position_verified", "name_verified")),
                             ("metro_structures", ("implemented", "verified")),
                             ("delivery_locations", ("verified_access",))):
            if not tables[table]:
                self.block("empty_inventory", f"scope.{table} has no inventory")
            for item_id, item in tables[table].items():
                if not all([self.boolean(item.get(k), item_id + "." + k) for k in flags]):
                    self.block("unverified_scope_item", f"{table}.{item_id} has unfinished required properties")
        for table in ("displayed_names", "route_cases", "review_views"):
            if not tables[table]:
                self.block("empty_inventory", f"scope.{table} has no inventory")
        routes_passed = views_passed = 0
        for table in ("route_cases", "review_views"):
            for item_id, item in tables[table].items():
                refs = self.arr(item.get("evidence_ids"), item_id + ".evidence_ids")
                records = [self.evidence[r] for r in refs if isinstance(r, str) and r in self.good_evidence]
                for ref in refs:
                    if not isinstance(ref, str) or ref not in self.evidence:
                        self.issue("missing_evidence", f"{item_id} refers to nonexistent evidence {ref!r}")
                if table == "route_cases":
                    graph = any(r["evidence_class"] == "simulation_test" and item_id in r.get("scope_ids", []) for r in records)
                    runtime = any(r["evidence_class"] in {"browser_test", "physical_android", "physical_ios"} and item_id in r.get("scope_ids", []) for r in records)
                    passed = graph and runtime
                    routes_passed += int(passed)
                else:
                    passed = any(r["evidence_class"] in {"ai_visual_review", "local_field_review"} and
                                 r.get("comparison", {}).get("view_id") == item_id for r in records)
                    views_passed += int(passed)
                if not passed:
                    self.block("scope_evidence_missing", f"{table}.{item_id} lacks current required evidence")
        geometry = scope.get("geometry_artifact")
        if geometry is None:
            self.block("scope_geometry_missing", "Frozen scope has no geographic artifact")
        else:
            path = self.artifact(geometry, "scope.geometry_artifact")
            if path:
                geo = self.read_json(path, "scope geometry")
                features = self.arr(geo.get("features"), "scope geometry.features")
                if geo.get("type") != "FeatureCollection":
                    self.issue("scope_geojson", "Scope geometry must be a GeoJSON FeatureCollection")
                feature_ids = {str(f.get("id")) for f in features if isinstance(f, dict)}
                if not set(roads).issubset(feature_ids):
                    self.issue("scope_geojson", "Every selected road ID must appear in the scope GeoJSON")
        expected_coverage = {
            "roads_total_metres": total if roads else None,
            "roads_implemented_metres": implemented,
            "roads_verified_metres": verified,
            "frontage_total_metres": frontage_total if intervals else None,
            "frontage_inspected_metres": frontage_inspected,
            "business_inventory_complete": inventory_complete,
            "businesses_inventoried": len(tables["businesses"]),
            "businesses_verified_and_implemented": businesses_verified,
            "displayed_names_total": len(tables["displayed_names"]),
            "displayed_names_verified": names_verified,
            "required_route_cases": len(tables["route_cases"]),
            "passed_route_cases": routes_passed,
            "required_review_views": len(tables["review_views"]),
            "passed_review_views": views_passed,
        }
        declared = self.obj(status.get("coverage"), "status.coverage")
        for key, expected in expected_coverage.items():
            value = declared.get(key)
            if key not in declared:
                self.issue("coverage_field", f"status.coverage is missing {key}")
            elif isinstance(expected, bool):
                if type(value) is not bool or value != expected:
                    self.issue("coverage_mismatch", f"{key}: declared {value!r}; derived {expected!r}")
            elif expected is None:
                if value is not None:
                    self.issue("unknown_denominator", f"{key} must remain null while its inventory is unknown")
            elif type(value) not in (int, float) or not math.isfinite(value) or not math.isclose(value, expected, rel_tol=1e-9, abs_tol=1e-6):
                self.issue("coverage_mismatch", f"{key}: declared {value!r}; derived {expected!r}")
        self.summary["derived_coverage"] = expected_coverage

    def run(self, status_path, requirements_path, scope_path, evidence_path):
        try:
            return self._run(status_path, requirements_path, scope_path, evidence_path)
        except (TypeError, KeyError, AttributeError, ValueError, OverflowError, OSError) as exc:
            self.issue("malformed_metadata", f"Malformed or unreadable ledger: {type(exc).__name__}: {exc}")
            return {
                "validator": "evidence-ledger-and-integrity-only", "schema_version": 1,
                "valid_ledger": False, "ready_for_requested_release": False,
                "error_count": sum(i["severity"] == "error" for i in self.issues),
                "blocker_count": sum(i["severity"] == "blocker" for i in self.issues),
                "issues": self.issues,
                "limitations": "Invalid metadata prevented a complete audit. This checker cannot prove geography or genuine device use.",
            }, 2

    def _run(self, status_path, requirements_path, scope_path, evidence_path):
        docs = {}
        paths = {}
        for name, value in (("status", status_path), ("requirements", requirements_path),
                            ("scope", scope_path), ("evidence", evidence_path)):
            docs[name], paths[name] = self.load(value, name)
            self.header(docs[name], name)
        status, requirements, scope, evidence = (docs[n] for n in ("status", "requirements", "scope", "evidence"))
        for name, value in docs.items():
            if value.get("project_id") != status.get("project_id"):
                self.issue("project_mismatch", f"{name}.project_id differs from status")
        for name in ("run_id", "phase", "activity"):
            self.string(status.get(name), "status." + name)
        self.timestamp(status.get("updated_at"), "status.updated_at")
        requested = self.string(status.get("requested_release"), "status.requested_release")
        achieved = self.string(status.get("achieved_release"), "status.achieved_release")
        if requested != "completed_requested_network":
            self.issue("requested_release", "The supplied contract requests completed_requested_network")
        if achieved not in RELEASES:
            self.issue("achieved_release", "status.achieved_release is invalid")
        if achieved != requested:
            self.block("requested_goal_incomplete", f"Requested {requested}; achieved {achieved}")
        if not status.get("code_revision"):
            self.block("code_revision_unknown", "Current code revision is not recorded")
        else:
            self.string(status["code_revision"], "status.code_revision")
        binding_data = self.obj(status.get("bindings"), "status.bindings")
        bound_docs = {}
        for name in BINDINGS:
            value = binding_data.get(name)
            path = self.artifact(value, "status.bindings." + name, allow_unbuilt=True)
            if path:
                if name in paths and path != paths[name]:
                    self.issue("binding_path", f"Bound {name} file differs from the CLI input")
                self.current_hashes[name] = sha256(path)
                if name in {"build", "world", "config"}:
                    bound_docs[name] = self.read_json(path, "bound " + name)
                    if bound_docs[name].get("project_id") != status.get("project_id"):
                        self.issue("project_mismatch", f"{name}.project_id differs from status")
        platforms = []
        if "config" in bound_docs:
            platforms = self.validate_config(bound_docs["config"], status)
        for name in ("build", "world"):
            if name in bound_docs:
                self.validate_manifest(bound_docs[name], name, status)
        self.validate_evidence(evidence)
        self.validate_checks(status, requirements, platforms)
        self.validate_scope(scope, status)
        if "world" in bound_docs and bound_docs["world"].get("source_snapshot_id") != scope.get("source_snapshot_id"):
            self.issue("source_snapshot_mismatch", "World and scope source snapshot IDs differ")
        for field in ("blockers", "next_actions"):
            for value in self.arr(status.get(field), "status." + field):
                self.string(value, "status." + field + "[]")
        if status.get("blockers"):
            self.block("declared_blockers", "Status still declares unresolved blockers")
        budget_usage = self.obj(status.get("budget_usage"), "status.budget_usage")
        for field in ("paid_spend", "source_download_bytes", "asset_bytes", "elapsed_minutes"):
            self.number(budget_usage.get(field), "status.budget_usage." + field)
        counts = {name: sum(value == name for value in self.check_results.values()) for name in sorted(RESULTS | {"invalid_pass"})}
        errors = sum(i["severity"] == "error" for i in self.issues)
        blockers = sum(i["severity"] == "blocker" for i in self.issues)
        report = {
            "validator": "evidence-ledger-and-integrity-only", "schema_version": 1,
            "valid_ledger": errors == 0, "ready_for_requested_release": errors == 0 and blockers == 0,
            "requested_release": requested, "achieved_release": achieved,
            "checked_requirements": len(self.check_results), "requirement_results": counts,
            "current_binding_hashes": self.current_hashes,
            **self.summary, "error_count": errors, "blocker_count": blockers,
            "limitations": "Metadata and hashes cannot prove real-world geography, genuine device use, authentic imagery, or semantic test correctness. Inspect evidence and rerun consequential checks.",
            "issues": self.issues,
        }
        return report, 2 if errors else (1 if self.release and blockers else 0)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Existing implementation project directory")
    parser.add_argument("--status", default="qa/status.json")
    parser.add_argument("--requirements", default="requirements.json")
    parser.add_argument("--scope", default="scope-manifest.json")
    parser.add_argument("--evidence", default="qa/evidence-index.json")
    parser.add_argument("--release", action="store_true", help="Exit nonzero until the entire requested release is ready")
    args = parser.parse_args(argv)
    validator = Validator(args.root, args.release)
    report, code = validator.run(args.status, args.requirements, args.scope, args.evidence)
    print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
    return code


if __name__ == "__main__":
    sys.exit(main())
