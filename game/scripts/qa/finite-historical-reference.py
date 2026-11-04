"""Diagnostic consumer of exact, source-reviewed historical support fragments.

This is deliberately separate from solve-road-profiles.py. It supplies every
literal affine value at one certified point, never a selected height, current
node equality, old-coverage override or independent-clearance exemption. The
original historical own-seam proof and production sampler remain untouched.
"""
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import uuid


def read_bound_json(path, expected_sha256):
    data = Path(path).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError('Historical reference input hash differs')
    return json.loads(data)


def verify_bound_file(path, expected_sha256):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024*1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected_sha256:
        raise ValueError('Historical reference input hash differs')


def rational(value):
    if isinstance(value, Fraction):
        return value
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('Expected a finite number, not a coerced coordinate')
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('Non-finite historical coordinate')
    return Fraction(value)


def point(value, *, encoded=False):
    if len(value) != 2:
        raise ValueError('Expected exactly two point coordinates')
    return tuple(Fraction(v) if encoded and isinstance(v, str) else rational(v)
                 for v in value)


def cross(a, b, p):
    return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])


def area2(poly):
    return sum(a[0]*b[1]-a[1]*b[0] for a, b in zip(poly, poly[1:]+poly[:1]))


def convex_polygon(encoded):
    vertices = tuple(point(p, encoded=True) for p in encoded)
    if len(vertices) < 3 or len(set(vertices)) != len(vertices) or not area2(vertices):
        raise ValueError('Finite cell must be a non-degenerate simple polygon')
    winding = 1 if area2(vertices) > 0 else -1
    # Check every vertex against every edge, not just local turns. This rejects
    # concave/self-intersecting input without introducing a geometric epsilon.
    if any(winding*cross(a, b, p) < 0 for a, b in
           zip(vertices, vertices[1:]+vertices[:1]) for p in vertices):
        raise ValueError('Expected one exact convex finite cell')
    return vertices


def contains(poly, p):
    winding = 1 if area2(poly) > 0 else -1
    return all(winding*cross(a, b, p) >= 0
               for a, b in zip(poly, poly[1:]+poly[:1]))


def contact_contains(contact, p):
    if len(contact) == 1:
        return contact[0] == p
    if len(contact) != 2:
        raise ValueError('Boundary-only authority needs an exact point or line')
    a, b = contact
    return cross(a, b, p) == 0 and all(min(a[k], b[k]) <= p[k] <= max(a[k], b[k])
                                    for k in (0, 1))


def literal_bindings(triangle):
    bindings = triangle.get('actualSurfaceBindings', [triangle.get('actualSurface')])
    if not bindings or triangle.get('actualSurface') not in bindings:
        raise ValueError('Missing literal representative surface binding')
    return bindings


def literal_affine(triangle, surface, p):
    a, b, c = [tuple(rational(v) for v in q) for q in triangle['points']]
    xz = [(q[0], q[2]) for q in (a, b, c)]
    det = cross(*xz)
    if not det or not contains(tuple(xz), p):
        return None
    weights = (cross(xz[1], xz[2], p)/det,
               cross(xz[2], xz[0], p)/det,
               cross(xz[0], xz[1], p)/det)
    film = rational(surface['paintLift'])
    if film < 0:
        raise ValueError('Invalid literal paint lift')
    return sum(w*q[1] for w, q in zip(weights, (a, b, c)))-film


class FiniteHistoricalReferenceIndex:
    """Point-local reference-set semantics; no new source/height permission.

    The constructor trusts caller-supplied decoded objects and hash identities.
    Use from_files to verify the actual historical, proof and source file bytes.
    An additive source correction cannot silently reuse this index with a new
    source hash. A subsequent model prepare must explicitly revalidate its
    finite query points.
    """

    def __init__(self, historical, proofs, *, historical_sha256,
                 source_geometry_sha256, source_reference_sha256):
        self.triangles = historical['triangles']
        self.regions = {}
        self.owner_faces = {}
        self.bindings = {}
        self.proof_sources = set()
        pinned = {'historical': historical_sha256, 'geometry': source_geometry_sha256,
                  'source': source_reference_sha256}
        for proof_sha, proof in proofs:
            if (proof.get('activePolicy') is not False or
                    proof.get('heightAuthorityGranted') is not False or
                    proof.get('releaseApproved') is not False or
                    proof.get('supportingFaceSourceFailures')):
                raise ValueError('Expected inactive independently reviewed finite evidence')
            if any(proof['inputs'][key]['sha256'] != value for key, value in pinned.items()):
                raise ValueError('Finite proof belongs to another historical/source tuple')
            for candidate in proof['candidates']:
                road = candidate['road']
                connector = candidate['fullConnectorID']
                if str(uuid.UUID(connector)) != connector or not connector.startswith(candidate['node']):
                    raise ValueError('Full source connector identity is required')
                if candidate.get('finiteSourceCensusGate') not in (
                        'passes-within-existing-finite-source-interval',
                        'passes-with-explicit-one-strip-old-branch-extension'):
                    raise ValueError('Finite supporting source census is incomplete')
                for fragment in candidate['finiteCapStripFragments']:
                    geometry = fragment['exactFiniteReferenceGeometry']
                    census = geometry['exhaustiveOwnerFaceCensus']
                    if (census['sourceHistoricalSHA256'] != historical_sha256 or
                            census['owner'] != road or
                            census['allHistoricalTrianglesCount'] != len(self.triangles)):
                        raise ValueError('Unbound exhaustive historical owner census')
                    outer = convex_polygon(geometry['exactOuterIntersectionPolygon'])
                    cells = []
                    for cell in geometry['cells']:
                        polygon = convex_polygon(cell['exactPolygon'])
                        if any(not contains(outer, p) for p in polygon):
                            raise ValueError('A certified cell extends outside its finite domain')
                        cells.append((polygon, frozenset(cell['affineFacesCoveringEntireCell'])))
                    contacts = {}
                    for contact in geometry['boundaryOnlyLiteralFaceContacts']:
                        exact = tuple(point(p, encoded=True) for p in contact['exactContactGeometry'])
                        if len(exact) not in (1, 2) or any(not contains(outer, p) for p in exact):
                            raise ValueError('Invalid finite boundary contact')
                        contacts.setdefault(contact['actualFace'], []).append(exact)
                    faces = set()
                    for record in geometry['allRelevantLiteralAffineFaceBindings']:
                        face = record['actualFace']
                        ti, bi = map(int, face.split(':'))
                        triangle = self.triangles[ti]
                        surface = literal_bindings(triangle)[bi]
                        if (triangle['road'] != road or triangle['points'] != record['actualPoints'] or
                                triangle['tile'] != record['tile'] or triangle['arc'] != record['arc'] or
                                triangle['centre'] != record['centre'] or triangle['cap'] != record['cap'] or
                                surface != record['binding'] or surface['paintLift'] != record['paintLift']):
                            raise ValueError('Finite affine face differs from the exact literal binding')
                        prior = self.bindings.setdefault(face, (triangle, surface))
                        if prior != (triangle, surface):
                            raise ValueError('Conflicting literal face binding')
                        faces.add(face)
                    referenced = set(contacts) | set().union(*(set(ids) for _, ids in cells))
                    if referenced != faces:
                        raise ValueError('Cell/contact and literal binding inventories differ')
                    region = (outer, tuple(cells), contacts, frozenset(faces), connector, proof_sha)
                    self.regions.setdefault(road, []).append(region)
                    self.proof_sources.add(proof_sha)
        # Query-time exhaustive owner census prevents an omitted positive face
        # or boundary binding from gaining authority merely through a triangle key.
        for ti, triangle in enumerate(self.triangles):
            road = triangle['road']
            if road in self.regions:
                for bi, surface in enumerate(literal_bindings(triangle)):
                    self.owner_faces.setdefault(road, []).append((f'{ti}:{bi}', triangle, surface))

    @classmethod
    def from_files(cls, historical_path, historical_sha256, proof_inputs, *,
                   source_geometry_path, source_reference_path,
                   source_geometry_sha256, source_reference_sha256):
        verify_bound_file(source_geometry_path, source_geometry_sha256)
        verify_bound_file(source_reference_path, source_reference_sha256)
        historical = read_bound_json(historical_path, historical_sha256)
        proofs = [(digest, read_bound_json(path, digest)) for path, digest in proof_inputs]
        return cls(historical, proofs, historical_sha256=historical_sha256,
                   source_geometry_sha256=source_geometry_sha256,
                   source_reference_sha256=source_reference_sha256)

    def reference(self, road, query_point):
        p = point(query_point)
        regions = [r for r in self.regions.get(road, ()) if contains(r[0], p)]
        if not regions:
            return None
        actual = {}
        for face, triangle, surface in self.owner_faces[road]:
            height = literal_affine(triangle, surface, p)
            if height is not None:
                actual[face] = height
        if not actual:
            return None
        proved = []
        for outer, cells, contacts, faces, connector, proof_sha in regions:
            domains = set().union(*(set(ids) for polygon, ids in cells if contains(polygon, p)))
            domains.update(face for face, values in contacts.items()
                           if any(contact_contains(contact, p) for contact in values))
            # Every actual face must be covered by this one full proof region.
            # Combining unrelated incomplete regions cannot manufacture a proof.
            if set(actual) <= domains <= faces:
                proved.append((connector, proof_sha))
        if not proved:
            return None
        return {'kind': 'exact-finite-literal-historical-reference-set',
                'road': road, 'exactPoint': tuple(str(v) for v in p),
                'affineValues': tuple({'actualFace': face, 'exactStructuralHeight': str(value)}
                                      for face, value in sorted(actual.items())),
                'sourceConnectors': tuple(sorted({p[0] for p in proved})),
                'proofSHA256': tuple(sorted({p[1] for p in proved})),
                'actualHistoricalCoverage': True,
                'currentHeightAuthority': False, 'independentCrossingWaiver': False}
