"""Observe the held classification with its reporting cap removed.

This never edits or fits with the production solver. It compiles a separately
identified instrumented AST: one report-list cap becomes True, and a callback
stops execution before numeric contexts or solve outputs can be written. The
original input guards, geometry, classifications and expressions are retained.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

SOLVER_SHA256 = '46219d8cb566ff117895507fd4e43219bc5a498a7e225cb2617a59392a0fad6e'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def instrument(source):
    tree = ast.parse(source)
    before = ast.dump(tree, include_attributes=False)
    matches = []
    for node in ast.walk(tree):
        if (isinstance(node, ast.If)
                and ast.dump(node.test, include_attributes=False) == ast.dump(ast.parse('len(unclassified)<1000', mode='eval').body, include_attributes=False)):
            if (len(node.body) != 1 or node.orelse
                    or not isinstance(node.body[0], ast.Expr)
                    or not isinstance(node.body[0].value, ast.Call)
                    or ast.unparse(node.body[0].value.func) != 'unclassified.append'):
                raise ValueError('Unclassified cap is not an observation-only append')
            matches.append(node)
    if len(matches) != 1:
        raise ValueError('Expected exactly one unclassified report cap')
    original_test = matches[0].test
    matches[0].test = ast.copy_location(ast.Constant(value=True), original_test)
    changed = ast.dump(tree, include_attributes=False)
    # An independent reverse transformation must recover every original node.
    matches[0].test = original_test
    if ast.dump(tree, include_attributes=False) != before:
        raise ValueError('Unexpected source mutation during instrumentation')
    matches[0].test = ast.copy_location(ast.Constant(value=True), original_test)
    insertion = [index for index, node in enumerate(tree.body)
                 if isinstance(node, ast.If) and ast.unparse(node.test) == 'args.diagnostic_solve_context']
    if len(insertion) != 1 or not any(isinstance(node, ast.FunctionDef) and node.name == 'solve' for node in tree.body[:insertion[0]]):
        raise ValueError('Expected one pre-output/pre-solve capture boundary')
    callback = ast.parse('_capture_complete_unclassified(globals())').body[0]
    tree.body.insert(insertion[0], callback)
    ast.fix_missing_locations(tree)
    return tree, {
        'originalASTSHA256': digest(before.encode()),
        'capOnlyASTSHA256': digest(changed.encode()),
        'instrumentedASTSHA256': digest(ast.dump(tree, include_attributes=False).encode()),
        'originalCapLine': original_test.lineno,
        'changes': ['Replace exactly one unclassified.append reporting cap with True',
                    'Capture once before diagnostic context serialization and before solve; stop immediately'],
        'productionSolverFileChanged': False,
    }


class CaptureComplete(BaseException):
    pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--solver', type=Path, required=True)
    parser.add_argument('--source-command', type=Path, required=True)
    parser.add_argument('--capped-diagnosis', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Preserve the existing observation; choose a new output')
    solver = args.solver.resolve(); source = solver.read_bytes()
    if digest(source) != SOLVER_SHA256:
        raise ValueError('Held solver bytes changed; re-review instrumentation first')
    command_bytes = args.source_command.read_bytes(); command = json.loads(command_bytes)
    diagnosis_bytes = args.capped_diagnosis.read_bytes(); diagnosis = json.loads(diagnosis_bytes)
    if not command.get('researchOnly') or command.get('releaseApproved') is not False:
        raise ValueError('Expected the original inactive research command')
    argv = command['argv']
    if len(argv) < 3 or argv[1] != '-u' or Path(argv[2]).resolve() != solver:
        raise ValueError('Command must name the exact held local solver')
    if Path.cwd().resolve() != Path(command['cwd']).resolve():
        raise ValueError('Use the bound original repository working directory')
    tree, transformation = instrument(source)
    result = {}
    with tempfile.TemporaryDirectory(prefix='road-unclassified-observer-') as directory:
        directory = Path(directory); run_argv = list(argv[2:])
        for flag, basename in [('--output', 'unused-fit.json'), ('--diagnostic-solve-context', 'unused-context.pickle')]:
            if flag in run_argv:
                run_argv[run_argv.index(flag)+1] = str(directory / basename)
        # A valid cache is only a speed aid. Copy it to keep even cache miss
        # writes away from the original trusted cache file.
        original_cache = None
        if '--overlap-cache' in run_argv:
            index = run_argv.index('--overlap-cache')+1
            original_cache = Path(run_argv[index]); cache_bytes = original_cache.read_bytes()
            copied_cache = directory / 'overlap-cache.pickle'; copied_cache.write_bytes(cache_bytes)
            run_argv[index] = str(copied_cache)

        def capture(environment):
            records = environment['unclassified']
            if len(records) != environment['category']['unclassified']:
                raise ValueError('Full reporting inventory differs from actual category count')
            if len(records) != diagnosis['summary']['unclassifiedTotalReportedByProduction']:
                raise ValueError('Actual full classification count changed')
            fields = ['pair', 'point', 'levels', 'oldGap', 'currentGap', 'oldCovered']
            key = lambda row: json.dumps({field: row[field] for field in fields}, sort_keys=True, separators=(',', ':'))
            current = {key(row) for row in records}
            missing = [row for row in diagnosis['cappedUnclassifiedExamples'] if key(row) not in current]
            if missing:
                raise ValueError('An original capped classification record changed or disappeared')
            for name, expected in environment['initialInputSHA'].items():
                path = Path(getattr(environment['args'], name))
                if digest(path.read_bytes()) != expected:
                    raise ValueError('Held classifier input changed: ' + name)
            if solver.read_bytes() != source or args.source_command.read_bytes() != command_bytes or args.capped_diagnosis.read_bytes() != diagnosis_bytes:
                raise ValueError('Observation input/source drift')
            if original_cache and original_cache.read_bytes() != cache_bytes:
                raise ValueError('Original cache changed during observation')
            result.update(schema='complete-unclassified-road-observer-v1', researchOnly=True,
                          releaseApproved=False, heightAuthorityGranted=False, actualSolverUnchanged=True,
                          numericSolveExecuted=False, transformation=transformation,
                          inputs={str(solver): digest(source), str(args.source_command.resolve()): digest(command_bytes),
                                  str(args.capped_diagnosis.resolve()): digest(diagnosis_bytes)},
                          classifierInputs=environment['initialInputSHA'],
                          summary={'unclassified': len(records), 'allOriginalCappedRecordsRetained': len(diagnosis['cappedUnclassifiedExamples']),
                                   'historicalUnresolved': len(environment['historicalReferenceUnresolved']),
                                   'categories': dict(environment['category']), 'variables': environment['N']},
                          samples=records, observerSHA256=digest(Path(__file__).read_bytes()))
            raise CaptureComplete()

        old_argv = sys.argv
        try:
            sys.argv = run_argv
            environment = {'__name__': '__main__', '__file__': str(solver), '_capture_complete_unclassified': capture}
            try:
                exec(compile(tree, str(solver)+' [explicit observation AST]', 'exec'), environment)
            except CaptureComplete:
                pass
        finally:
            sys.argv = old_argv
        if not result:
            raise ValueError('Classifier did not reach the pre-output observation boundary')
        if (directory/'unused-fit.json').exists() or (directory/'unused-context.pickle').exists():
            raise ValueError('Unexpected numeric/model output was written')
    with args.output.open('x') as output:
        json.dump(result, output, separators=(',', ':'), allow_nan=False); output.write('\n')
    print(json.dumps({'output': str(args.output), 'sha256': digest(args.output.read_bytes()), 'summary': result['summary']}))


if __name__ == '__main__':
    main()
