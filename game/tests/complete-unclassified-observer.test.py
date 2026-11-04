import ast
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('unclassified_observer', Path(__file__).resolve().parents[1]/'scripts/qa/export-complete-unclassified-road-samples.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)

SOURCE = '''
unclassified=[]
for point in range(1003):
    if len(unclassified)<1000:unclassified.append(point)
def solve(grade):
    raise RuntimeError('must never solve')
if args.diagnostic_solve_context:
    raise RuntimeError('must never write')
solve(.1)
'''


class CompleteUnclassifiedObserverTests(unittest.TestCase):
    def test_full_report_capture_stops_before_outputs_or_solve(self):
        tree, report = M.instrument(SOURCE)
        captured = []
        def capture(environment):
            captured.extend(environment['unclassified']); raise M.CaptureComplete()
        with self.assertRaises(M.CaptureComplete):
            exec(compile(tree, '<test>', 'exec'), {'_capture_complete_unclassified':capture})
        self.assertEqual(captured, list(range(1003)))
        self.assertFalse(report['productionSolverFileChanged'])

    def test_only_append_reporting_cap_is_accepted(self):
        for source in [SOURCE.replace('unclassified.append(point)', 'solve(point)'),
                       SOURCE.replace('len(unclassified)<1000','len(unclassified)<999'),
                       SOURCE.replace('def solve(grade)', 'def another(grade)'),
                       SOURCE+'\nif len(unclassified)<1000:unclassified.append(0)\n',
                       SOURCE+'\nif args.diagnostic_solve_context:pass\n']:
            with self.assertRaises(ValueError): M.instrument(source)

    def test_functions_and_original_source_text_are_retained(self):
        tree, report = M.instrument(SOURCE)
        original = ast.parse(SOURCE)
        self.assertEqual(ast.dump(next(n for n in tree.body if isinstance(n,ast.FunctionDef))),
                         ast.dump(next(n for n in original.body if isinstance(n,ast.FunctionDef))))
        self.assertNotEqual(report['originalASTSHA256'], report['capOnlyASTSHA256'])
        self.assertEqual(SOURCE.count('len(unclassified)<1000'),1)

    def test_actual_held_source_has_one_compatible_observation(self):
        source=(Path(__file__).resolve().parents[1]/'scripts/solve-road-profiles.py').read_bytes()
        self.assertEqual(M.digest(source),M.SOLVER_SHA256)
        tree, report=M.instrument(source)
        self.assertEqual(sum(isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='_capture_complete_unclassified' for n in tree.body),1)
        self.assertEqual(len(report['changes']),2)


if __name__=='__main__': unittest.main()
