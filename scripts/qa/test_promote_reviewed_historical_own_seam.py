"""Focused offline checks for the exact approved c32 classification promotion.

Run: python3 -m unittest discover -s scripts/qa -p 'test_promote_reviewed_historical_own_seam.py' -v
The byte-pinned proposal and independent receipt must be available in /tmp (or
at ROADSTER_C32_APPROVED_PROPOSAL / ROADSTER_C32_APPROVED_RECEIPT).
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


REPO = Path(__file__).resolve().parents[2]
PRODUCER = REPO / "scripts/qa/promote-reviewed-historical-own-seam.py"
SPEC = importlib.util.spec_from_file_location("reviewed_own_seam", PRODUCER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
PROPOSAL = Path(os.environ.get("ROADSTER_C32_APPROVED_PROPOSAL",
                              "/tmp/roadster-c32-own-seam-source-classification-proposal-9413-v2.json"))
RECEIPT = Path(os.environ.get("ROADSTER_C32_APPROVED_RECEIPT",
                             "/tmp/roadster-c32-own-seam-classification-independent-receipt-9413-v1.json"))


class PromotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proposal = MODULE.pinned_json(PROPOSAL, MODULE.PROPOSAL_SHA256)
        cls.receipt = MODULE.pinned_json(RECEIPT, MODULE.RECEIPT_SHA256)
        cls.parent = MODULE.pinned_json(REPO / MODULE.PARENT_RELATIVE, MODULE.PARENT_SHA256)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.output = Path(self.temporary.name) / "proof.json"

    def assert_structural_failure_before_write(self, parent=None, proposal=None, receipt=None):
        # Exercise promote's real ordering while substituting only the already
        # byte-pinned parsed fixtures, so semantic defenses are tested directly.
        with mock.patch.object(MODULE, "pinned_json", side_effect=[
                proposal or self.proposal, receipt or self.receipt, parent or self.parent]), \
                mock.patch.object(MODULE, "verify_dependencies") as dependency_check:
            with self.assertRaises(MODULE.VerificationError):
                MODULE.promote(REPO, PROPOSAL, RECEIPT, self.output)
            dependency_check.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_exact_approved_structure(self):
        MODULE.validate_structure(self.parent, self.proposal, self.receipt)

    def test_proposal_whitespace_change_fails_byte_pin_before_write(self):
        changed = Path(self.temporary.name) / "proposal.json"
        changed.write_bytes(PROPOSAL.read_bytes() + b" ")
        with self.assertRaisesRegex(MODULE.VerificationError, "Pinned input SHA256 mismatch"):
            MODULE.promote(REPO, changed, RECEIPT, self.output)
        self.assertFalse(self.output.exists())

    def test_self_declared_receipt_cannot_replace_exact_approval(self):
        changed = Path(self.temporary.name) / "receipt.json"
        forged = copy.deepcopy(self.receipt)
        forged["scope"] = "self-declared pass"
        changed.write_text(json.dumps(forged))
        with self.assertRaisesRegex(MODULE.VerificationError, "Pinned input SHA256 mismatch"):
            MODULE.promote(REPO, PROPOSAL, changed, self.output)
        self.assertFalse(self.output.exists())

    def test_missing_parent_group_before_write(self):
        proposal = copy.deepcopy(self.proposal)
        proposal["groups"].pop()
        self.assert_structural_failure_before_write(proposal=proposal)

    def test_duplicate_parent_group_before_write(self):
        parent, proposal = copy.deepcopy(self.parent), copy.deepcopy(self.proposal)
        parent["groups"][1] = copy.deepcopy(parent["groups"][0])
        proposal["groups"] = copy.deepcopy(parent["groups"])
        self.assert_structural_failure_before_write(parent=parent, proposal=proposal)

    def test_extra_proposed_group_before_write(self):
        proposal = copy.deepcopy(self.proposal)
        proposal["proposedGroups"].append(copy.deepcopy(proposal["proposedGroups"][0]))
        self.assert_structural_failure_before_write(proposal=proposal)

    def test_modified_parent_literal_before_write(self):
        proposal = copy.deepcopy(self.proposal)
        proposal["groups"][0]["literalSurfaceBindings"][0]["paintLift"] += .001
        self.assert_structural_failure_before_write(proposal=proposal)

    def test_modified_c32_literal_before_write(self):
        for key in ("paintLift", "structuralQuad", "legacySourceBranches", "literalActualSurface"):
            with self.subTest(key=key):
                proposal = copy.deepcopy(self.proposal)
                binding = proposal["proposedGroups"][0]["literalSurfaceBindings"][0]
                del binding[key]
                self.assert_structural_failure_before_write(proposal=proposal)

    def test_c32_source_proof_omission_before_write(self):
        proposal = copy.deepcopy(self.proposal)
        del proposal["proposedGroups"][0]["incidentSourceProofs"][0]["originalSources"]
        self.assert_structural_failure_before_write(proposal=proposal)

    def test_original_source_proof_omission_before_write(self):
        proposal = copy.deepcopy(self.proposal)
        proposal["sourceProof"].pop(next(iter(proposal["sourceProof"])))
        self.assert_structural_failure_before_write(proposal=proposal)

    def test_unchanged_input_proof_omission_before_write(self):
        proposal = copy.deepcopy(self.proposal)
        proposal["beforeAfterUnchangedInputs"].pop(next(iter(self.parent["beforeAfterUnchangedInputs"])))
        self.assert_structural_failure_before_write(proposal=proposal)

    def test_receipt_cannot_grant_height_or_geometry_or_release(self):
        for key in ("releaseApproved", "runtimeChanged", "solverChanged", "historicalGeometryChanged",
                    "installedHeightAssigned"):
            with self.subTest(key=key):
                receipt = copy.deepcopy(self.receipt)
                receipt[key] = True
                self.assert_structural_failure_before_write(receipt=receipt)

    def test_dependency_mismatch_and_prewrite_mutation(self):
        dependency = Path(self.temporary.name) / "dependency"
        dependency.write_bytes(b"approved")
        verifier = MODULE.ByteVerifier()
        with self.assertRaisesRegex(MODULE.VerificationError, "Dependency SHA256 mismatch"):
            verifier.verify(dependency, MODULE.digest_bytes(b"other"))
        verifier.verify(dependency, MODULE.digest_bytes(b"approved"))
        dependency.write_bytes(b"changed")
        with self.assertRaisesRegex(MODULE.VerificationError, "Dependency changed before write"):
            verifier.recheck()
        self.assertFalse(self.output.exists())

    def test_conflicting_maps_do_not_silently_rebase(self):
        with self.assertRaisesRegex(MODULE.VerificationError, "Conflicting unchanged-input"):
            MODULE.merge_maps({"/same": "a"}, {"/same": "b"})

    def test_incomplete_raw_pack_inventory_rejected(self):
        with mock.patch.object(MODULE, "pack_inventory", return_value=set()):
            with self.assertRaisesRegex(MODULE.VerificationError, "complete current 304-pack"):
                MODULE.verify_dependencies(REPO, self.parent, self.proposal, self.receipt, mock.Mock())

    def test_historical_source_blob_hash_is_checked(self):
        with mock.patch.object(MODULE.subprocess, "check_output", return_value=b"changed historical source"):
            with self.assertRaisesRegex(MODULE.VerificationError, "Historical sourceProof mismatch"):
                MODULE.verify_dependencies(REPO, self.parent, self.proposal, self.receipt, mock.Mock())

    def test_output_is_never_overwritten(self):
        self.output.write_bytes(b"existing evidence")
        with self.assertRaisesRegex(MODULE.VerificationError, "Refusing to overwrite"):
            MODULE.promote(REPO, PROPOSAL, RECEIPT, self.output)
        self.assertEqual(self.output.read_bytes(), b"existing evidence")

    def test_dangling_output_symlink_is_never_followed(self):
        target = Path(self.temporary.name) / "missing"
        self.output.symlink_to(target)
        with self.assertRaisesRegex(MODULE.VerificationError, "Refusing to overwrite"):
            MODULE.promote(REPO, PROPOSAL, RECEIPT, self.output)
        self.assertTrue(self.output.is_symlink())
        self.assertFalse(target.exists())

    def test_report_preserves_literals_and_all_original_proof_maps(self):
        merged = MODULE.merge_maps(*(doc["beforeAfterUnchangedInputs"]
                                     for doc in (self.parent, self.proposal, self.receipt)))
        report = MODULE.build_report(self.parent, self.proposal, self.receipt, merged, PRODUCER,
                                     PROPOSAL, RECEIPT, 327)
        self.assertEqual(report["groups"][:5], self.parent["groups"])
        expected = copy.deepcopy(self.proposal["proposedGroups"][0])
        expected.update(classificationProposalOnly=False, independentlyReviewed=True,
                        independentReviewReceiptSHA256=MODULE.RECEIPT_SHA256)
        self.assertEqual(report["groups"][5], expected)
        self.assertEqual(report["sourceProof"], self.parent["sourceProof"])
        self.assertEqual(report["priorSummary"], self.parent["summary"])
        self.assertEqual(report["independentReviewReceipt"], self.receipt)
        for name, original in (("parent", self.parent), ("proposal", self.proposal),
                               ("independentReceipt", self.receipt)):
            self.assertEqual(report["originalBeforeAfterUnchangedInputs"][name],
                             original["beforeAfterUnchangedInputs"])
        self.assertEqual(report["summary"]["groups"], 6)
        self.assertEqual(report["summary"]["witnesses"], 53)
        self.assertEqual(report["summary"]["groupsWithoutExplicitWitnessCounts"], 1)
        self.assertEqual(report["summary"]["literalSurfaceBindings"], 35)
        self.assertTrue(report["classificationOnly"])
        self.assertFalse(report["releaseApproved"])
        self.assertFalse(report["installedHeightAssigned"])
        self.assertEqual(report["classificationPromotion"]["producerSHA256"], MODULE.digest_file(PRODUCER))


if __name__ == "__main__":
    unittest.main()
