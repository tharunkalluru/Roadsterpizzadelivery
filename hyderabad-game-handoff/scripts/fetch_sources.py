#!/usr/bin/env python3
"""Verify cached OSM sources by default; explicitly refresh into a new dated snapshot."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import math
import re
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
from inventory_osm import (  # noqa: E402
    DEFAULT_MANIFEST, MAX_SOURCE_BYTES, SourceError, load_manifest,
    parse_osm_xml, read_limited, safe_path, utc_now, verify_manifest, write_new_json,
)

ALLOWED_HOSTS = {"api.openstreetmap.org", "www.openstreetmap.org", "openstreetmap.org", "overpass-api.de"}
SENSITIVE_QUERY_KEYS = {"access_token", "api_key", "apikey", "authorization", "password", "secret", "token"}
USER_AGENT = "HyderabadMetroGameSourceKit/2.0 (offline world preparation)"
MAX_REFRESH_REQUESTS = 20


def validate_url(url: str, method: str = "GET") -> str:
    if not isinstance(url, str) or any(ord(char) < 32 for char in url):
        raise SourceError("Source URL must be an ordinary HTTPS string")
    parts = urllib.parse.urlsplit(url)
    try:
        port = parts.port
    except ValueError as exc:
        raise SourceError("Invalid source URL port") from exc
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS or port not in (None, 443):
        raise SourceError(f"Source URL is outside the permitted public HTTPS hosts: {url!r}")
    if parts.username or parts.password or parts.fragment:
        raise SourceError("Source URL must not contain credentials or a fragment")
    if any(key.casefold() in SENSITIVE_QUERY_KEYS for key, _ in urllib.parse.parse_qsl(parts.query)):
        raise SourceError("Credential-like query parameters are not accepted")
    if method not in ("GET", "POST"):
        raise SourceError(f"Only GET and documented read-only Overpass POST are supported: {method}")
    if parts.hostname == "overpass-api.de":
        if parts.path != "/api/interpreter":
            raise SourceError("Only the public Overpass interpreter endpoint is supported")
    elif method != "GET" or not re.fullmatch(r"/api/0\.6/(?:map(?:\.json)?|relation/[1-9]\d*(?:/full)?(?:\.json)?)", parts.path):
        raise SourceError("OSM source requests must use the supported GET map or relation endpoints")
    if method == "POST" and (parts.hostname != "overpass-api.de" or parts.query):
        raise SourceError("POST requires the documented Overpass interpreter without URL query parameters")
    return url


class PublicSourceRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        validate_url(new_url, "GET")
        if request.get_method() != "GET":
            raise SourceError("Automatic POST redirects are not followed; review the source endpoint")
        return super().redirect_request(request, response, code, message, headers, new_url)


def download_bytes(url: str, method: str, body: bytes | None, *, max_bytes: int, timeout: float, deadline_seconds: float) -> tuple[bytes, dict]:
    """No credentials, cookies, implicit retries, or ambient proxy credentials."""
    validate_url(url, method)
    started = time.monotonic()
    requested_at = utc_now()
    headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "identity"}
    if method == "POST":
        if body is None:
            raise SourceError("Overpass POST requires a verified query file")
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"
    elif body is not None:
        raise SourceError("GET source requests must not have a body")
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), PublicSourceRedirects())
    with opener.open(request, timeout=min(timeout, deadline_seconds)) as response:
        validate_url(response.geturl(), method)
        if response.status != 200:
            raise SourceError(f"Unexpected HTTP status: {response.status}")
        encoding = response.headers.get("Content-Encoding", "identity").lower()
        if encoding not in ("", "identity"):
            raise SourceError(f"Unexpected content encoding: {encoding}; no implicit decompression is performed")
        declared_length = response.headers.get("Content-Length")
        if declared_length is not None:
            try:
                declared_bytes = int(declared_length)
            except ValueError as exc:
                raise SourceError("Invalid Content-Length") from exc
            if declared_bytes < 0 or declared_bytes > max_bytes:
                raise SourceError("Declared response exceeds the byte limit or is negative")
        chunks, total = [], 0
        reader = getattr(response, "read1", response.read)
        while True:
            if time.monotonic() - started > deadline_seconds:
                raise SourceError("Per-request elapsed-time budget exceeded")
            chunk = reader(min(65536, max_bytes - total + 1))
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise SourceError("Downloaded response exceeds the byte limit")
            chunks.append(chunk)
        if time.monotonic() - started > deadline_seconds:
            raise SourceError("Per-request elapsed-time budget exceeded")
        return b"".join(chunks), {
            "requested_at": requested_at,
            "received_at": utc_now(),
            "effective_url": response.geturl(),
            "content_type": response.headers.get("Content-Type"),
        }


def validate_source_payload(name: str, data: bytes) -> dict:
    if name.endswith(".osm"):
        root = parse_osm_xml(data, name)
        counts = {kind: len(root.findall(kind)) for kind in ("node", "way", "relation")}
        if not sum(counts.values()):
            raise SourceError(f"Empty OSM extract: {name}")
        return {"counts": counts}
    if name.endswith(".json"):
        try:
            payload = json.loads(data)
        except (ValueError, UnicodeDecodeError) as exc:
            raise SourceError(f"Expected OSM JSON, received invalid content: {name}") from exc
        if not isinstance(payload, dict) or payload.get("remark") or payload.get("error"):
            raise SourceError(f"OSM JSON contains an error or Overpass remark: {name}")
        elements = payload.get("elements")
        if not isinstance(elements, list) or not elements:
            raise SourceError(f"Missing OSM elements: {name}")
        if any(not isinstance(element, dict) or element.get("error") or element.get("type") not in ("node", "way", "relation") for element in elements):
            raise SourceError(f"Malformed or partial OSM JSON elements: {name}")
        for element in elements:
            if not isinstance(element.get("id"), int) or isinstance(element["id"], bool) or element["id"] <= 0:
                raise SourceError(f"Invalid JSON source element ID: {name}")
            if element["type"] == "node":
                try:
                    lat, lon = float(element["lat"]), float(element["lon"])
                    if not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                        raise ValueError("Coordinates outside geographic bounds")
                except (KeyError, TypeError, ValueError) as exc:
                    raise SourceError(f"Invalid JSON node coordinates: {name}") from exc
            elif element["type"] == "way":
                if not isinstance(element.get("nodes"), list) or any(not isinstance(ref, int) or isinstance(ref, bool) or ref <= 0 for ref in element["nodes"]):
                    raise SourceError(f"Invalid JSON way node references: {name}")
            else:
                members = element.get("members")
                if not isinstance(members, list) or any(not isinstance(member, dict) or member.get("type") not in ("node", "way", "relation") or not isinstance(member.get("ref"), int) or isinstance(member.get("ref"), bool) or member["ref"] <= 0 for member in members):
                    raise SourceError(f"Invalid JSON relation members: {name}")
        result = {"counts": {kind: sum(element["type"] == kind for element in elements) for kind in ("node", "way", "relation")}}
        osm_metadata = payload.get("osm3s", {})
        if not isinstance(osm_metadata, dict):
            raise SourceError(f"Invalid OSM metadata object: {name}")
        timestamp = osm_metadata.get("timestamp_osm_base")
        if timestamp:
            result["osm_base_timestamp"] = timestamp
        return result
    raise SourceError(f"Unsupported downloadable source format: {name}")


def write_new_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as handle:
        handle.write(data)


def refresh_snapshot(manifest_path: Path, *, output_root: Path | None = None, only: list[str] | None = None,
                     max_bytes: int = 12 * 1024 * 1024, max_total_bytes: int = 40 * 1024 * 1024,
                     timeout: float = 30, deadline_seconds: float = 60, delay: float = 1) -> tuple[Path, dict]:
    manifest, base = load_manifest(manifest_path)
    by_name = {entry["file"]: entry for entry in manifest["files"]}
    if only and set(only) - by_name.keys():
        raise SourceError("Unknown --only file: " + ", ".join(sorted(set(only) - by_name.keys())))
    selected = [entry for entry in manifest["files"] if not only or entry["file"] in only]
    downloadable = [entry for entry in selected if entry.get("url")]
    if not downloadable:
        raise SourceError("No selected entries have a download URL")
    if len(downloadable) > MAX_REFRESH_REQUESTS:
        raise SourceError(f"At most {MAX_REFRESH_REQUESTS} public source requests are permitted per refresh; use a bulk extract for larger work")
    for entry in downloadable:
        method = entry.get("method", "GET")
        if not isinstance(method, str):
            raise SourceError(f"Invalid HTTP method for {entry['file']}")
        validate_url(entry["url"], method.upper())
    cache_integrity = verify_manifest(manifest, base)
    output_root = (output_root or base.parent / "osm-snapshots").expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    destination = Path(tempfile.mkdtemp(prefix=stamp + "-", dir=output_root))
    result = {
        "created_at": utc_now(),
        "status": "in_progress",
        "data_license": manifest.get("data_license"),
        "attribution": manifest.get("attribution"),
        "license_url": manifest.get("license_url"),
        "source_manifest": str(manifest_path.expanduser().resolve()),
        "source_manifest_sha256": hashlib.sha256(read_limited(manifest_path.expanduser().resolve(), 2 * 1024 * 1024)).hexdigest(),
        "previous_cache_integrity": cache_integrity,
        "files": [],
        "failures": [],
        "skipped": [{"file": entry["file"], "reason": "No download URL; derived reports must be recalculated. A needed query file is copied separately after hash verification."} for entry in selected if not entry.get("url")],
        "limitations": [
            "This is a new source snapshot, not an update of frozen source bytes and not a field-verified world package.",
            "Requests run sequentially and may observe different OSM revision times. Compare object versions before accepting the snapshot.",
            "Downloaded XML/JSON receives structural checks. Run inventory_osm.py and geographic review on the resulting manifest.",
            "Derived reports are deliberately not copied as current results. Missing or failed files keep this snapshot incomplete.",
            "The request deadline is checked between reads; one blocked read can finish as late as the socket timeout after the deadline. No infinite retry loop is used.",
            "Public OSM and Overpass services are acquisition resources, not a runtime game backend.",
        ],
    }
    copied_queries = set()
    downloaded_bytes = 0
    for index, entry in enumerate(downloadable):
        name = entry["file"]
        method = entry.get("method", "GET").upper()
        if index:
            time.sleep(delay)
        print(f"[{index + 1}/{len(downloadable)}] Acquiring {name}", file=sys.stderr, flush=True)
        try:
            remaining = max_total_bytes - downloaded_bytes
            if remaining <= 0:
                raise SourceError("Total download byte budget exhausted")
            body = None
            if method == "POST":
                query_name = entry.get("query_file")
                if not isinstance(query_name, str) or not query_name.endswith(".overpassql") or query_name not in by_name:
                    raise SourceError("Overpass POST needs a manifest-listed .overpassql query file")
                query = read_limited(safe_path(base, query_name), 16384)
                query_entry = by_name[query_name]
                if len(query) != query_entry["bytes"] or hashlib.sha256(query).hexdigest() != query_entry["sha256"].lower():
                    raise SourceError("Overpass query does not match its frozen manifest hash")
                try:
                    body = urllib.parse.urlencode({"data": query.decode("utf-8")}).encode("utf-8")
                except UnicodeDecodeError as exc:
                    raise SourceError("Overpass query must be UTF-8") from exc
                if query_name not in copied_queries:
                    write_new_bytes(safe_path(destination, query_name), query)
                    result["files"].append({"file": query_name, "bytes": len(query), "sha256": hashlib.sha256(query).hexdigest(), "status": "copied_verified_query", "copied_from_manifest": str(manifest_path.expanduser().resolve())})
                    copied_queries.add(query_name)
            data, metadata = download_bytes(entry["url"], method, body, max_bytes=min(max_bytes, remaining), timeout=timeout, deadline_seconds=deadline_seconds)
            downloaded_bytes += len(data)
            payload_metadata = validate_source_payload(name, data)
            target = safe_path(destination, name)
            write_new_bytes(target, data)
            fresh = {
                "file": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                "status": "source_imported_not_field_verified", "url": entry["url"], "method": method,
                "previous_sha256": entry["sha256"], "matches_previous_bytes": hashlib.sha256(data).hexdigest() == entry["sha256"].lower(),
                **metadata, **payload_metadata,
            }
            for key in ("bbox_west_south_east_north", "query_file"):
                if key in entry:
                    fresh[key] = entry[key]
            result["files"].append(fresh)
        except (OSError, SourceError, urllib.error.URLError) as exc:
            result["failures"].append({"file": name, "url": entry["url"], "failed_at": utc_now(), "error": str(exc)})
            print(f"  Failed: {exc}", file=sys.stderr, flush=True)
    result["status"] = "partial_source_snapshot" if result["failures"] else "acquired_source_snapshot_requires_review"
    result["completed_at"] = utc_now()
    result["downloaded_bytes"] = downloaded_bytes
    write_new_json(destination / "resource-acquisition-manifest.json", result)
    return destination, result


class FetchSelfTests(unittest.TestCase):
    @staticmethod
    def fixture(base: Path, include_query: bool = False) -> Path:
        base.mkdir(parents=True)
        payload = b'<osm><node id="1" version="1" lat="17" lon="78"/></osm>'
        write_new_bytes(base / "sample.osm", payload)
        entries = [{"file": "sample.osm", "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(), "url": "https://api.openstreetmap.org/api/0.6/map?bbox=78,17,78.001,17.001"}]
        if include_query:
            query = b'[out:json];relation(8826295);out body;'
            write_new_bytes(base / "metro.overpassql", query)
            entries.append({"file": "metro.overpassql", "bytes": len(query), "sha256": hashlib.sha256(query).hexdigest()})
            metro = b'{"elements":[{"type":"relation","id":8826295,"members":[]}]}'
            write_new_bytes(base / "metro.json", metro)
            entries.append({"file": "metro.json", "bytes": len(metro), "sha256": hashlib.sha256(metro).hexdigest(), "url": "https://overpass-api.de/api/interpreter", "method": "POST", "query_file": "metro.overpassql"})
        path = base / "resource-acquisition-manifest.json"
        write_new_json(path, {"files": entries, "data_license": "ODbL-1.0"})
        return path

    def test_default_is_offline_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = self.fixture(Path(directory) / "cache")
            with mock.patch(__name__ + ".download_bytes", side_effect=AssertionError("Network must not run")), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--manifest", str(manifest)]), 0)

    def test_unsafe_hosts_credentials_and_methods_are_rejected(self):
        for url, method in [
            ("http://api.openstreetmap.org/api/0.6/map", "GET"),
            ("https://evil.example/api/0.6/map", "GET"),
            ("https://user:password@api.openstreetmap.org/api/0.6/map", "GET"),
            ("https://api.openstreetmap.org:444/api/0.6/map", "GET"),
            ("https://api.openstreetmap.org/api/0.6/map?access_token=x", "GET"),
            ("https://api.openstreetmap.org/api/0.6/map", "POST"),
            ("https://overpass-api.de/api/interpreter", "DELETE"),
        ]:
            with self.assertRaises(SourceError):
                validate_url(url, method)
        validate_url("https://overpass-api.de/api/interpreter", "POST")

    def test_refresh_is_separate_and_supports_verified_post(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.fixture(root / "cache", include_query=True)
            frozen = {path.name: path.read_bytes() for path in manifest.parent.iterdir()}
            calls = []
            def fake_download(url, method, body, **kwargs):
                calls.append((method, body))
                payload = b'<osm><node id="1" version="2" lat="17.1" lon="78"/></osm>' if method == "GET" else b'{"elements":[{"type":"relation","id":8826295,"members":[]}]}'
                return payload, {"requested_at": utc_now(), "received_at": utc_now(), "effective_url": url, "content_type": "test fixture"}
            with mock.patch(__name__ + ".download_bytes", side_effect=fake_download), mock.patch("time.sleep"), contextlib.redirect_stderr(io.StringIO()):
                first, result = refresh_snapshot(manifest, output_root=root / "snapshots")
                second, _ = refresh_snapshot(manifest, output_root=root / "snapshots")
            self.assertNotEqual(first, second)
            self.assertFalse(result["failures"])
            self.assertTrue(any(method == "POST" and b"data=" in body for method, body in calls))
            self.assertEqual(frozen, {path.name: path.read_bytes() for path in manifest.parent.iterdir()})
            fresh_manifest, fresh_base = load_manifest(first / "resource-acquisition-manifest.json")
            self.assertTrue(verify_manifest(fresh_manifest, fresh_base)["ok"])

    def test_corrupt_query_is_not_sent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.fixture(root / "cache", include_query=True)
            (manifest.parent / "metro.overpassql").write_bytes(b"changed")
            with mock.patch(__name__ + ".download_bytes", side_effect=AssertionError("Corrupt query must not be sent")), contextlib.redirect_stderr(io.StringIO()):
                _, result = refresh_snapshot(manifest, output_root=root / "snapshots", only=["metro.json"])
            self.assertEqual(result["status"], "partial_source_snapshot")
            self.assertIn("manifest hash", result["failures"][0]["error"])

    def test_error_payloads_do_not_become_source_files(self):
        for name, data in [("a.json", b'{"remark":"timeout","elements":[]}'), ("a.json", b'<html>gateway</html>'), ("a.osm", b'<osm><error>partial</error></osm>')]:
            with self.assertRaises(SourceError):
                validate_source_payload(name, data)

    def test_download_size_limit_and_redirect_allowlist(self):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers = {}
        response.geturl.return_value = "https://api.openstreetmap.org/api/0.6/map"
        response.read1.side_effect = [b"12345", b""]
        opener = mock.Mock()
        opener.open.return_value = response
        with mock.patch("urllib.request.build_opener", return_value=opener):
            with self.assertRaises(SourceError):
                download_bytes(response.geturl(), "GET", None, max_bytes=4, timeout=1, deadline_seconds=2)
        request = urllib.request.Request("https://api.openstreetmap.org/api/0.6/map")
        with self.assertRaises(SourceError):
            PublicSourceRedirects().redirect_request(request, None, 302, "Found", {}, "https://evil.example/collect")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--verify", action="store_true", help="Verify local source hashes only; this is the default")
    mode.add_argument("--refresh", action="store_true", help="Explicitly download a new dated snapshot without overwriting the frozen cache")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output-root", type=Path, help="Parent of a new dated snapshot directory; default resources/osm-snapshots")
    parser.add_argument("--only", action="append", metavar="FILE", help="Refresh only this manifest-listed source; repeat to select several")
    parser.add_argument("--timeout", type=float, default=30, help="Socket timeout per blocking network operation, at most 30 seconds")
    parser.add_argument("--deadline", type=float, default=60, help="Elapsed-time budget checked between reads, at most 60 seconds")
    parser.add_argument("--max-bytes", type=int, default=12 * 1024 * 1024, help="Maximum response bytes per source")
    parser.add_argument("--max-total-bytes", type=int, default=40 * 1024 * 1024, help="Maximum successful response bytes across this refresh")
    parser.add_argument("--delay", type=float, default=1, help="Sequential request spacing in seconds, between 0.5 and 5")
    parser.add_argument("--self-test", action="store_true", help="Run local mocked network and source-preservation tests")
    args = parser.parse_args(argv)
    if args.self_test:
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(FetchSelfTests))
        return 0 if result.wasSuccessful() else 1
    if not (0 < args.timeout <= 30 and args.timeout <= args.deadline <= 60):
        parser.error("Require 0 < --timeout <= 30 and --timeout <= --deadline <= 60")
    if not (0 < args.max_bytes <= MAX_SOURCE_BYTES and args.max_bytes <= args.max_total_bytes <= 128 * 1024 * 1024):
        parser.error("Invalid byte budgets: per-source limit must be positive and at most 24 MiB; total limit must be at least that and at most 128 MiB")
    if not 0.5 <= args.delay <= 5:
        parser.error("--delay must be between 0.5 and 5 seconds")
    if not args.refresh and (args.output_root or args.only):
        parser.error("--output-root and --only require explicit --refresh")
    try:
        if not args.refresh:
            manifest, base = load_manifest(args.manifest)
            result = verify_manifest(manifest, base)
            print(f"Cache verification: {'PASS' if result['ok'] else 'FAIL'} ({result['checked_files']} files)")
            for item in result["files"]:
                if not item["ok"]:
                    print(f"  {item['file']}: {item['error']}")
            print("No network requests made. Frozen source bytes were not modified.")
            return 0 if result["ok"] else 1
        destination, result = refresh_snapshot(args.manifest, output_root=args.output_root, only=args.only, max_bytes=args.max_bytes, max_total_bytes=args.max_total_bytes, timeout=args.timeout, deadline_seconds=args.deadline, delay=args.delay)
        print(f"Snapshot: {destination}")
        print(f"Status: {result['status']}; failures: {len(result['failures'])}; response bytes: {result['downloaded_bytes']}")
        print("Re-run the inventory against this snapshot manifest before considering any source update.")
        return 1 if result["failures"] else 0
    except (OSError, SourceError) as exc:
        print(f"Source acquisition failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
