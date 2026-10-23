"""Local Mapillary credential/readiness helpers; never log credential contents."""
import importlib.util
import os
import subprocess
import sys

KEYCHAIN_ACCOUNT = 'thisistharun'
KEYCHAIN_SERVICE = 'codex-roadster-mapillary'
OCR_MODULES = {
    'numpy': 'numpy', 'cv2': 'opencv-python', 'rapidocr_onnxruntime': 'rapidocr-onnxruntime',
    'rapidfuzz': 'rapidfuzz', 'wordninja': 'wordninja',
}


def load_token():
    # An explicitly empty environment value requests offline/cache-only operation.
    if 'MAPILLARY_TOKEN' in os.environ:
        return os.environ['MAPILLARY_TOKEN'].strip() or None
    if sys.platform != 'darwin':
        return None
    try:
        result = subprocess.run(['/usr/bin/security', 'find-generic-password', '-a', KEYCHAIN_ACCOUNT,
                                 '-s', KEYCHAIN_SERVICE, '-w'], capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else None


def dependency_status():
    missing = [package for module, package in OCR_MODULES.items() if importlib.util.find_spec(module) is None]
    return dict(status='ready' if not missing else 'missing_dependencies', missingPackages=missing)
