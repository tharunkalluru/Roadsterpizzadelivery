#!/usr/bin/env python3
"""Read-only validation of the immutable handoff inputs, not of the game."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def local_path(root: Path, value: object) -> Path:
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError("invalid relative path")
    relative = PurePosixPath(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("path escapes the handoff")
    target = root.joinpath(*relative.parts).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise ValueError("path is missing or outside the handoff")
    return target


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def inspect(root: Path) -> dict:
    errors: list[str] = []
    manifest = read_json(root / "kit-manifest.json")
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("kit-manifest.json requires a nonempty files array")
    seen: set[str] = set()
    verified = 0
    for record in files:
        if not isinstance(record, dict):
            errors.append("Malformed file record in kit-manifest.json")
            continue
        name = record.get("path")
        try:
            path = local_path(root, name)
            if name in seen:
                raise ValueError("duplicate manifest path")
            seen.add(name)
            size = record.get("bytes")
            expected_hash = record.get("sha256")
            if type(size) is not int or size < 0:
                raise ValueError("invalid byte count")
            if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
                raise ValueError("invalid SHA-256")
            if path.stat().st_size != size or sha256(path) != expected_hash:
                raise ValueError("bytes or SHA-256 do not match")
            if path.suffix == ".json":
                read_json(path)
            verified += 1
        except (OSError, ValueError, TypeError) as exc:
            errors.append(f"{name!s}: {exc}")

    required = {
        "START_HERE.md", "CLAUDE.md", "CLAUDE_CODE_SETUP.md",
        "AGENT_START_PROMPT.md", "AGENT_ENVIRONMENT.md", "GRAPHICS_REFERENCE_WHITEOUT.md",
        "MASTER_PROMPT.md", "PLAYER_EXPERIENCE.md", "GRAPHICS_AND_MAP_CONTRACT.md",
        "config/project-contract.json", "config/flight-budget.json", "config/visual-quality.json",
        "resources/RESOURCE_GUIDE.md", "resources/ASSET_AND_DATA_WORK_ORDERS.md",
        "resources/resource-index.json", "resources/osm/resource-acquisition-manifest.json",
        "resources/STARTER_ASSETS.md", "resources/materials/asset-manifest.json",
        "resources/fonts/asset-manifest.json", "references/README.md",
        "references/opus-5.5-user-provided-guide.txt",
        "monitoring/FORMAT.md", "monitoring/SUPERVISOR_PROMPT.md",
        "monitoring/requirements.template.json", "monitoring/status.template.json",
        "monitoring/scope.template.json", "monitoring/evidence-index.template.json",
        "monitoring/visual-reference-review.template.json",
        "monitoring/verify_run.py", "scripts/fetch_sources.py", "scripts/inventory_osm.py",
        "scripts/check_handoff.py", "KIT_VALIDATION.md"
    }
    for name in sorted(required - seen):
        errors.append(f"Required input is not listed and verified: {name}")

    if errors:
        return {"valid_handoff": False, "verified_files": verified, "errors": errors}

    master_path = local_path(root, "MASTER_PROMPT.md")
    master = master_path.read_text(encoding="utf-8")
    requirements = read_json(local_path(root, "monitoring/requirements.template.json"))
    expected_ids = {f"{prefix}{number:02d}" for prefix, count in [("G",12),("F",24),("M",14),("U",12),("P",8),("Q",12)] for number in range(1,count+1)}
    records = requirements.get("requirements", [])
    actual_ids = [record.get("id") for record in records]
    if len(actual_ids) != 82 or set(actual_ids) != expected_ids:
        errors.append("The handoff must contain the complete 82 distinct acceptance IDs")
    descriptions = {}
    for line in master.splitlines():
        match = re.match(r"\|\s*([GFMUPQ]\d{2})\s*\|\s*(.*?)\s*\|", line)
        if match:
            if match.group(1) in descriptions:
                errors.append(f"Duplicate acceptance row: {match.group(1)}")
            descriptions[match.group(1)] = match.group(2)
    if set(descriptions) != expected_ids:
        errors.append("Master acceptance matrix does not match the 82 required IDs")
    for record in records:
        if record.get("description") != descriptions.get(record.get("id")):
            errors.append(f"Acceptance description differs from master: {record.get('id')}")
    if requirements.get("source_specification_sha256") != sha256(master_path):
        errors.append("Requirements template is bound to a different master prompt")

    contract = read_json(local_path(root, "config/project-contract.json"))
    flight = read_json(local_path(root, "config/flight-budget.json"))
    visual = read_json(local_path(root, "config/visual-quality.json"))
    game_flight = contract.get("flight", {})
    if contract.get("required_platforms") != ["android", "ios"]:
        errors.append("Frozen handoff platforms differ from Android and iOS")
    for field, expected in {
        "default_budget_seconds": 25, "allowed_budget_seconds": [20,25,30],
        "continuous_flight_allowed": True, "split_flights_allowed": True,
        "per_burst_limit_seconds": None, "regenerates_during_contract": False,
        "reserve_is_within_budget": True, "intermediate_stop_refills": False,
        "recovery_refunds": False
    }.items():
        if field not in game_flight or game_flight[field] != expected:
            errors.append(f"Project flight contract mismatch: {field}")
    if flight.get("default_budget_seconds") != 25 or flight.get("allocations_ticks") != {"20":1200,"25":1500,"30":1800}:
        errors.append("Flight allocation configuration does not match the shared-budget contract")
    if flight.get("per_launch_duration_cap_seconds") is not None or flight.get("ground_refill_ticks_per_second") != 0:
        errors.append("Legacy flight cap or ground recharge in detailed configuration")
    if visual.get("baseline_sustained_fps_target") != contract.get("release_defaults",{}).get("minimum_sustained_mobile_fps_target"):
        errors.append("Visual performance target differs from the project contract")
    if visual.get("required_physical_platforms") != contract.get("required_platforms"):
        errors.append("Visual and project phone requirements disagree")
    if manifest.get("kit_version") != contract.get("specification_version"):
        errors.append("Kit and specification versions disagree")

    reference_url = "https://whiteout.plgb.chatgpt.site/"
    project_reference = contract.get("visual_reference", {})
    visual_reference = visual.get("required_reference", {})
    if project_reference.get("url") != reference_url or visual_reference.get("url") != reference_url:
        errors.append("The required user-selected Whiteout reference is missing or inconsistent")
    if project_reference.get("required") is not True or visual_reference.get("receiving_agent_must_inspect_gameplay") is not True:
        errors.append("Actual inspection of the required graphics reference must remain required")
    for record in (project_reference, visual_reference):
        try:
            local_path(root, record.get("contract_path"))
        except (OSError, ValueError) as exc:
            errors.append(f"Visual reference contract: {exc}")
    execution = contract.get("execution", {})
    if execution.get("requested_model") != "claude-opus-5-5" or execution.get("new_application_directory") != "game":
        errors.append("Requested Claude Code model or application directory differs from the handoff")
    if execution.get("max_consecutive_no_progress_continuations_same_task") != 3:
        errors.append("The bounded continuation limit differs from the handoff")

    catalog = read_json(local_path(root, "resources/resource-index.json"))
    for resource in catalog.get("resources", []):
        for name in resource.get("local_paths", []):
            try:
                local_path(root, name)
            except (OSError, ValueError) as exc:
                errors.append(f"Catalog resource {resource.get('id')}: {exc}")

    return {
        "valid_handoff": not errors,
        "kit_version": manifest.get("kit_version"),
        "verified_files": verified,
        "acceptance_requirements": len(actual_ids),
        "master_sha256": sha256(master_path),
        "game_implementation_started_by_this_check": False,
        "geographic_accuracy_or_phone_performance_certified": False,
        "errors": errors,
        "next_action": "Read the handoff, verify and inventory the source cache, then implement the game in the chosen project directory."
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        report = inspect(args.root.resolve())
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
        print(json.dumps({"valid_handoff": False, "errors": [str(exc)]}, indent=2))
        return 2
    print(json.dumps(report, indent=2))
    return 0 if report["valid_handoff"] else 1


if __name__ == "__main__":
    sys.exit(main())
