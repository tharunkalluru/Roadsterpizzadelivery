"""Path structure tags: a weather cover alone does not imply an elevated deck."""
import math

PATH_HIGHWAYS = {'footway', 'path', 'steps', 'pedestrian', 'cycleway', 'corridor'}


def path_kind(tags):
    if tags.get('highway') not in PATH_HIGHWAYS:
        return None
    try:
        layer = float(tags.get('layer') or 0)
    except (TypeError, ValueError):
        layer = 0
    if not math.isfinite(layer):
        layer = 0
    active = lambda value: bool(value) and value.lower() not in ('no', 'false', '0')
    if active(tags.get('tunnel')) or layer < 0:
        return 'subway'
    if active(tags.get('bridge')) or layer > 0:
        return 'footbridge'
    if tags.get('covered') == 'yes':
        return 'covered_path'
    return None
