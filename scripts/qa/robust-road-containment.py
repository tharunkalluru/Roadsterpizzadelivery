"""Strict build-time containment of literal historical road faces.

No geometric epsilon or projection enlarges a face. The common orientation
filter uses Shewchuk's binary64 error bound; uncertain signs use exact rational
arithmetic over the original floating values. This helper is not yet wired
into the held solver or the game's runtime.

Primary reference: https://www.cs.cmu.edu/~quake/robust.html (public-domain
predicates.c, ccwerrboundA). Python Fraction replaces the adaptive expansion.
"""
from fractions import Fraction
import math
import sys

_EPSILON = 2.0 ** -53
_CCW_ERROR_BOUND = (3.0 + 16.0 * _EPSILON) * _EPSILON


def _point(point):
    if len(point) != 2:
        raise ValueError('A point must contain exactly two finite coordinates')
    result = []
    for value in point:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError('A point coordinate must be a finite number')
        try:
            converted = float(value)
        except OverflowError as error:
            raise ValueError('Point coordinate is outside finite binary64') from error
        if not math.isfinite(converted) or isinstance(value, int) and int(converted) != value:
            raise ValueError('Point coordinate must be exactly represented as finite binary64')
        result.append(converted)
    return tuple(result)


def _exact_orientation(a, b, c):
    ax, ay, bx, by, cx, cy = map(Fraction, (*a, *b, *c))
    determinant = (ax - cx) * (by - cy) - (ay - cy) * (bx - cx)
    return (determinant > 0) - (determinant < 0)


def _orientation(a, b, c):
    left = (a[0] - c[0]) * (b[1] - c[1])
    right = (a[1] - c[1]) * (b[0] - c[0])
    determinant = left - right
    magnitude = abs(left) + abs(right)
    # Keep overflow and underflow outside the fast filter's assumptions. Exact
    # arithmetic also resolves zero/cancellation; no signed area is snapped.
    normal = lambda value: value == 0 or abs(value) >= sys.float_info.min
    if (math.isfinite(determinant) and math.isfinite(magnitude)
            and all(normal(value) for value in (left, right, determinant))
            and abs(determinant) > _CCW_ERROR_BOUND * magnitude):
        return (determinant > 0) - (determinant < 0)
    return _exact_orientation(a, b, c)


def orientation_sign(a, b, c):
    """Exact sign for finite binary64 coordinates, with a certified fast path."""
    return _orientation(*map(_point, (a, b, c)))


def triangle_contains_point(triangle, point):
    """Include actual edges/vertices, reject outside and zero-area triangles."""
    if len(triangle) != 3:
        raise ValueError('Expected one literal triangle')
    a, b, c = map(_point, triangle)
    p = _point(point)
    winding = _orientation(a, b, c)
    if winding == 0:
        return False
    return all(sign == 0 or sign == winding for sign in (
        _orientation(a, b, p), _orientation(b, c, p), _orientation(c, a, p)))
