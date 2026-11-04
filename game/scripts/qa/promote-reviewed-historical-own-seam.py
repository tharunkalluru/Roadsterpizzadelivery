"""Promote only the independently approved, byte-pinned c32 classification.

Offline evidence producer: no solver execution, geometry edits, height assignment,
package decoding, network access, or release approval. The existing independent
review supplies the geometric result; every byte-bound dependency is rechecked.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess


PROPOSAL_SHA256 = "cca66ffcb8b6d78d2d6f30e85929223752f80dc444650c4f4dfec016ed573066"
RECEIPT_SHA256 = "d96bab2efb2e47389e85f000930f90eaf012a77e8b3432ac166e2ced9fd6f5c7"
PARENT_SHA256 = "59a3937856d9b93c963cb1029708d3f0095f5f733c2fae713cd049597b857d21"
HISTORICAL_SHA256 = "dfccc814e522359add059509b693d2b9f880d7d89102941265c436e52a7af12e"
# Structural defense as well as the mandatory original-file pins. There is no
# command-line option to accept another proposal, receipt, or self-declared pass.
PROPOSED_GROUP_SHA256 = "02ae44a46d9f127a23953b90c258c8b69a935002b9bb987166d6be51bb914e0b"
NODE = "02ee8d86-d9a"
ROAD = "c32df37f-b8f_0"
CONNECTOR = "02ee8d86-d9ab-4649-919e-15c35ae27fe2"
CLASSIFICATION = "source-proved-local-at-grade-own-cap/strip-support-seam"
PARENT_RELATIVE = "docs/qa/evidence/reported-roads/historical-own-seam-source-root-extension-9413-20261103.json"


class VerificationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def digest_file(path):
    hasher = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def canonical_digest(value):
    return digest_bytes(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                  ensure_ascii=False, allow_nan=False).encode())


def pinned_json(path, expected):
    data = Path(path).read_bytes()
    require(digest_bytes(data) == expected, f"Pinned input SHA256 mismatch: {path}")
    return json.loads(data)


def validate_structure(parent, proposal, receipt):
    require(parent.get("pass") is True and parent.get("releaseApproved") is False,
            "Parent classification status is invalid")
    require(len(parent.get("groups", [])) == 5, "Exactly five parent groups required")
    require(proposal.get("groups") == parent["groups"], "Parent groups changed or missing")
    nodes = [group["node"] for group in parent["groups"]]
    require(len(set(nodes)) == 5 and NODE not in nodes, "Duplicate parent group")
    require(proposal.get("pass") is False and proposal.get("proposalOnly") is True
            and proposal.get("requiresIndependentReview") is True
            and proposal.get("releaseApproved") is False, "Expected inactive proposal")
    require(len(proposal.get("proposedGroups", [])) == 1, "Exactly one proposed group required")
    group = proposal["proposedGroups"][0]
    require(group.get("node") == NODE and group.get("representativeRoadID") == ROAD
            and group.get("fullConnectorID") == CONNECTOR
            and group.get("classification") == CLASSIFICATION, "Wrong c32 classification")
    require(group.get("classificationProposalOnly") is True, "Proposal already active")
    require(canonical_digest(group) == PROPOSED_GROUP_SHA256,
            "Approved proposed group changed: literal geometry or source proof omitted/modified")
    require(proposal.get("sourceProof") == parent.get("sourceProof")
            and len(parent.get("sourceProof", {})) == 3, "Original sourceProof changed or omitted")
    require(all(proposal.get("beforeAfterUnchangedInputs", {}).get(path) == digest
                for path, digest in parent.get("beforeAfterUnchangedInputs", {}).items())
            and parent.get("beforeAfterUnchangedInputs"), "Parent unchanged-input proof omitted")
    for key in ("pass", "classificationApproved", "solverReferenceClassificationApproved",
                "originalFiveGroupsPreservedExactly", "remoteAnnotationsRetained",
                "all57SurfaceVertexReferencesProjectedAgainstEachOfThreeFullWKBs"):
        require(receipt.get(key) is True, f"Independent receipt does not approve {key}")
    for key in ("releaseApproved", "runtimeChanged", "solverChanged",
                "historicalGeometryChanged", "installedHeightAssigned"):
        require(receipt.get(key) is False, f"Independent receipt exceeds classification scope: {key}")
    for key, expected in (("proposalSHA256", PROPOSAL_SHA256),
                          ("parentSHA256", PARENT_SHA256),
                          ("historicalSHA256", HISTORICAL_SHA256),
                          ("node", NODE), ("representativeRoadID", ROAD),
                          ("fullConnectorID", CONNECTOR), ("classification", CLASSIFICATION),
                          ("originalGroupCount", 5), ("literalBindingCount", 10)):
        require(receipt.get(key) == expected, f"Independent receipt binding mismatch: {key}")
    require(receipt["fullC32OverlapReplay"].get("allIncompatiblePairsExactlyProposed") is True
            and receipt["atFunctionReplay"].get("everyLiteralStructuralValueRetained") is True
            and receipt["atFunctionReplay"].get("unboundNegativeControlRejected") is True,
            "Independent literal-envelope replay is incomplete")
    require(receipt["allArmRawClosure"].get("historicalPacksScanned") == 304
            and receipt["allArmRawClosure"].get("allFreshV10SourceArmsMatch") is True,
            "Independent all-arm raw closure is incomplete")


def merge_maps(*maps):
    merged = {}
    for mapping in maps:
        for path, digest in mapping.items():
            require(path not in merged or merged[path] == digest,
                    f"Conflicting unchanged-input hash: {path}")
            merged[path] = digest
    return merged


class ByteVerifier:
    def __init__(self):
        self.checked = {}

    def verify(self, path, expected):
        path = Path(path).resolve(strict=True)
        require(path not in self.checked or self.checked[path] == expected,
                f"Conflicting resolved dependency: {path}")
        if path not in self.checked:
            require(digest_file(path) == expected, f"Dependency SHA256 mismatch: {path}")
            self.checked[path] = expected

    def recheck(self):
        for path, expected in self.checked.items():
            require(digest_file(path) == expected, f"Dependency changed before write: {path}")


def verify_artifact_references(value, verifier, repo):
    """Verify path/hash records, script/wheel pairs, raw pack copies and WKB bytes."""
    if isinstance(value, list):
        for item in value:
            verify_artifact_references(item, verifier, repo)
    elif isinstance(value, dict):
        if "path" in value and "sha256" in value:
            verifier.verify(value["path"], value["sha256"])
        if "pack" in value and "sourcePackSHA256" in value:
            verifier.verify(repo / "public/city" / value["pack"], value["sourcePackSHA256"])
        if "geometryWKBBytesSHA256" in value:
            require(digest_bytes(bytes.fromhex(value["geometryWKB"])) == value["geometryWKBBytesSHA256"],
                    "Inline source WKB bytes changed")
        for key, expected in value.items():
            if key.endswith("SHA256") and key[:-6] + "Path" in value:
                verifier.verify(value[key[:-6] + "Path"], expected)
        for item in value.values():
            verify_artifact_references(item, verifier, repo)


def pack_inventory(repo):
    return {path.resolve() for path in (repo / "public/city/packs").glob("*.pack.wasm")}


def verify_dependencies(repo, parent, proposal, receipt, verifier):
    maps = [doc["beforeAfterUnchangedInputs"] for doc in (parent, proposal, receipt)]
    merged = merge_maps(*maps)
    for path, expected in merged.items():
        verifier.verify(path, expected)
    for doc in (parent, proposal, receipt):
        verify_artifact_references(doc, verifier, repo)
    for path, proof in parent["sourceProof"].items():
        data = subprocess.check_output(["git", "show", proof["revision"] + ":" + path], cwd=repo)
        require(digest_bytes(data) == proof["sha256"], f"Historical sourceProof mismatch: {path}")
    verifier.verify(repo / "scripts/qa/extend-historical-own-seam-proof.py",
                    parent["rootExtension"]["generatorSHA256"])
    verifier.verify(repo / "public/city/core.pack.wasm", receipt["allArmRawClosure"]["corePackSHA256"])
    receipt_packs = {Path(path).resolve() for path in receipt["beforeAfterUnchangedInputs"]
                     if path.endswith(".pack.wasm") and Path(path).name != "core.pack.wasm"}
    require(len(receipt_packs) == 304 and receipt_packs == pack_inventory(repo),
            "Receipt does not bind the complete current 304-pack inventory")
    require(proposal["proposedGroups"][0]["allArmRawSourceClosure"]["copies"]
            == receipt["allArmRawClosure"]["packCopies"], "Raw arm-copy closure differs")
    for path, digest in ((receipt["historicalPath"], HISTORICAL_SHA256),
                         (receipt["parentPath"], PARENT_SHA256),
                         (receipt["proposalPath"], PROPOSAL_SHA256)):
        verifier.verify(path, digest)
        require(any(Path(candidate).resolve() == Path(path).resolve() and expected == digest
                    for candidate, expected in merged.items()), "Named approval input absent from proof maps")
    return merged, receipt_packs


def build_report(parent, proposal, receipt, merged, producer, proposal_path, receipt_path, verified_count):
    report = copy.deepcopy(parent)
    group = copy.deepcopy(proposal["proposedGroups"][0])
    group["classificationProposalOnly"] = False
    group["independentlyReviewed"] = True
    group["independentReviewReceiptSHA256"] = RECEIPT_SHA256
    report["groups"].append(group)
    require(report["groups"][:5] == parent["groups"], "Parent groups were not preserved exactly")
    report.update({"pass": True, "classificationOnly": True, "classificationApproved": True,
                   "solverReferenceClassificationApproved": True, "releaseApproved": False,
                   "proposalOnly": False, "requiresIndependentReview": False, "researchOnly": True,
                   "runtimeChanged": False, "solverChanged": False,
                   "historicalGeometryChanged": False, "installedHeightAssigned": False})
    report["scope"] = ("Five original parent groups retained exactly plus the exact independently reviewed c32 "
                       "finite own-cap/adjacent-strip reference envelope. Classification only; physical clearance, "
                       "gameplay and release gates remain open. No installed height or geometry change.")
    report["priorSummary"] = copy.deepcopy(parent["summary"])
    explicit_witnesses = [g["witnesses"] for g in report["groups"] if "witnesses" in g]
    report["summary"] = {
        "groups": len(report["groups"]), "parentGroups": len(parent["groups"]), "addedGroups": 1,
        "witnesses": sum(explicit_witnesses), "groupsWithExplicitWitnessCounts": len(explicit_witnesses),
        "groupsWithoutExplicitWitnessCounts": len(report["groups"]) - len(explicit_witnesses),
        "witnessCountScope": "Sum of existing explicit group counts only; c32 has finite-overlap evidence, no declared witness count.",
        "literalSurfaceBindings": sum(len(g["literalSurfaceBindings"]) for g in report["groups"]),
        "addedLiteralSurfaceBindings": len(group["literalSurfaceBindings"]),
        "addedFiniteOverlapPairs": len(group["finiteOverlapPairs"]),
        "fullyBoundExactSourceConnectors": all(g.get("fullConnectorID") and g.get("incidentSourceProofs")
                                               for g in report["groups"]),
        "independentLayerAtAnyConnector": False,
    }
    report["beforeAfterUnchangedInputs"] = merged
    report["originalBeforeAfterUnchangedInputs"] = {
        name: copy.deepcopy(doc["beforeAfterUnchangedInputs"])
        for name, doc in (("parent", parent), ("proposal", proposal), ("independentReceipt", receipt))
    }
    report["independentReviewReceipt"] = copy.deepcopy(receipt)
    report["classificationPromotion"] = {
        "producerPath": str(producer), "producerSHA256": digest_file(producer),
        "proposalPath": str(proposal_path.resolve()), "proposalSHA256": PROPOSAL_SHA256,
        "receiptPath": str(receipt_path.resolve()), "receiptSHA256": RECEIPT_SHA256,
        "parentPath": receipt["parentPath"], "parentSHA256": PARENT_SHA256,
        "historicalPath": receipt["historicalPath"], "historicalSHA256": HISTORICAL_SHA256,
        "parentGroupsPreservedExactly": True, "approvedProposedGroupSHA256": PROPOSED_GROUP_SHA256,
        "changedProposedGroupFields": ["classificationProposalOnly", "independentlyReviewed", "independentReviewReceiptSHA256"],
        "verifiedFileDependencies": verified_count, "historicalSourceProofBlobs": len(parent["sourceProof"]),
        "rawHistoricalPacksByteVerified": 304, "rawCorePackByteVerified": True,
        "geometryRerun": False, "classificationOnly": True, "releaseApproved": False,
    }
    return report


def promote(repo, proposal_path, receipt_path, output):
    repo, proposal_path, receipt_path, output = map(Path, (repo, proposal_path, receipt_path, output))
    repo = repo.resolve(strict=True)
    require(not os.path.lexists(output), f"Refusing to overwrite output: {output}")
    proposal = pinned_json(proposal_path, PROPOSAL_SHA256)
    receipt = pinned_json(receipt_path, RECEIPT_SHA256)
    parent_path = repo / PARENT_RELATIVE
    parent = pinned_json(parent_path, PARENT_SHA256)
    require(Path(receipt["parentPath"]).resolve() == parent_path.resolve(), "Actual parent path mismatch")
    validate_structure(parent, proposal, receipt)
    verifier = ByteVerifier()
    verifier.verify(proposal_path, PROPOSAL_SHA256)
    verifier.verify(receipt_path, RECEIPT_SHA256)
    verifier.verify(parent_path, PARENT_SHA256)
    producer = Path(__file__).resolve()
    verifier.verify(producer, digest_file(producer))
    merged, receipt_packs = verify_dependencies(repo, parent, proposal, receipt, verifier)
    merged = merge_maps(merged, {str(receipt_path.resolve()): RECEIPT_SHA256,
                                str(proposal_path.resolve()): PROPOSAL_SHA256,
                                str(producer): verifier.checked[producer]})
    report = build_report(parent, proposal, receipt, merged, producer, proposal_path, receipt_path,
                          len(verifier.checked))
    payload = (json.dumps(report, indent=2, allow_nan=False) + "\n").encode()
    verifier.recheck()
    require(pack_inventory(repo) == receipt_packs, "Raw pack inventory changed before write")
    # Exclusive creation is the final operation; invalid inputs never create an output.
    with output.open("xb") as stream:
        stream.write(payload)
    return {"output": str(output.resolve()), "sha256": digest_bytes(payload),
            "groups": len(report["groups"]), "classificationOnly": True, "releaseApproved": False,
            "verifiedFileDependencies": len(verifier.checked), "rawHistoricalPacksByteVerified": 304}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--proposal", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(promote(args.repo, args.proposal, args.receipt, args.output)))


if __name__ == "__main__":
    main()
