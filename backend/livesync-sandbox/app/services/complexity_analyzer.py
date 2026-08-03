import ast
import re
from typing import NamedTuple


class ComplexityResult(NamedTuple):
    time_complexity: str
    space_complexity: str
    explanation: str


class ComplexityAnalyzer:
    """
    Analyzes code snippets using AST parsing (Python) and structural pattern inspection
    (JavaScript, C#) to estimate Big-O Time & Space complexity.
    """

    def analyze(self, language: str, code: str) -> ComplexityResult:
        lang = (language or "").lower().strip()
        if lang == "python" or lang == "py":
            return self._analyze_python(code)
        elif lang in ("node", "javascript", "js", "typescript", "ts"):
            return self._analyze_javascript(code)
        elif lang in ("csharp", "cs"):
            return self._analyze_csharp(code)
        else:
            return self._fallback_analysis(code)

    def _analyze_python(self, code: str) -> ComplexityResult:
        try:
            tree = ast.parse(code)
        except Exception:
            return self._fallback_analysis(code)

        max_loop_depth = 0
        has_recursion = False
        has_sort = False
        has_divide_and_conquer = False
        has_collection_alloc = False
        has_matrix_alloc = False

        def get_nesting_depth(node: ast.AST, current_depth: int = 0, current_func: str | None = None) -> int:
            nonlocal has_recursion, has_sort, has_divide_and_conquer, has_collection_alloc, has_matrix_alloc
            depth = current_depth

            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                current_func = node.name

            if isinstance(node, (ast.For, ast.While, ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp)):
                depth += 1

            # Check recursion: call must occur INSIDE a function body and target the SAME function name
            if isinstance(node, ast.Call):
                func_id = None
                if isinstance(node.func, ast.Name):
                    func_id = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_id = node.func.attr

                if current_func and func_id == current_func:
                    has_recursion = True
                if func_id in ("sorted", "sort"):
                    has_sort = True

            # Check divide & conquer (binary division: // 2, / 2, >> 1)
            if isinstance(node, ast.BinOp):
                if isinstance(node.op, (ast.FloorDiv, ast.Div, ast.RShift)):
                    if isinstance(node.right, ast.Constant) and node.right.value == 2:
                        has_divide_and_conquer = True

            # Check collection allocation
            if isinstance(node, (ast.List, ast.Dict, ast.Set, ast.ListComp, ast.DictComp, ast.SetComp)):
                has_collection_alloc = True
                if current_depth >= 1:
                    has_matrix_alloc = True

            max_d = depth
            for child in ast.iter_child_nodes(node):
                max_d = max(max_d, get_nesting_depth(child, depth, current_func))
            return max_d

        max_loop_depth = get_nesting_depth(tree)

        # Determine Time Complexity
        if has_recursion and max_loop_depth >= 1:
            time_comp = "O(2^N)" if max_loop_depth > 1 else "O(2^N) / O(N!)"
            explanation = "Detected recursive call hierarchy combined with iterative loops."
        elif has_recursion:
            time_comp = "O(N)"
            explanation = "Linear O(N) recursive call stack."
        elif has_divide_and_conquer and max_loop_depth == 1:
            time_comp = "O(log N)"
            explanation = "Detected binary search / logarithmic divide-and-conquer pattern (O(log N))."
        elif has_sort:
            time_comp = "O(N log N)"
            explanation = "Detected sorting operations (O(N log N))."
        elif max_loop_depth == 0:
            time_comp = "O(1)"
            explanation = "Constant time O(1): sequence of statements without loops."
        elif max_loop_depth == 1:
            time_comp = "O(N)"
            explanation = "Linear time O(N): single-level iterative loop or comprehension."
        elif max_loop_depth == 2:
            time_comp = "O(N^2)"
            explanation = "Quadratic time O(N^2): 2 nested loops."
        else:
            time_comp = f"O(N^{max_loop_depth})"
            explanation = f"Polynomial time O(N^{max_loop_depth}): {max_loop_depth} nested loop levels."

        # Determine Space Complexity
        if has_matrix_alloc or (max_loop_depth >= 2 and has_collection_alloc):
            space_comp = "O(N^2)"
            space_expl = " allocated 2D data structure / matrix."
        elif has_collection_alloc or has_recursion:
            space_comp = "O(N)"
            space_expl = " linear auxiliary data structure or call stack."
        else:
            space_comp = "O(1)"
            space_expl = " constant auxiliary memory space."

        return ComplexityResult(
            time_complexity=time_comp,
            space_complexity=space_comp,
            explanation=f"{explanation} Space complexity is {space_comp} due to{space_expl}",
        )

    def _analyze_javascript(self, code: str) -> ComplexityResult:
        # Regex inspection for JS/TS
        loop_patterns = [r'\bfor\s*\(', r'\bwhile\s*\(', r'\bdo\s*\{', r'\.forEach\s*\(', r'\.map\s*\(', r'\.reduce\s*\(']
        total_loops = sum(len(re.findall(p, code)) for p in loop_patterns)

        # Estimate nesting depth
        max_depth = 0
        current_depth = 0
        for line in code.splitlines():
            if any(re.search(p, line) for p in loop_patterns):
                current_depth += 1
                max_depth = max(max_depth, current_depth)
            if '}' in line and current_depth > 0:
                current_depth -= 1

        has_sort = bool(re.search(r'\.sort\s*\(', code))
        has_recursion = bool(re.search(r'function\s+([a-zA-Z0-9_$]+).*\1\s*\(', code))
        has_array = bool(re.search(r'\[.*\]|\bnew\s+(Array|Map|Set)\b', code))

        if has_recursion:
            time_comp = "O(2^N)" if max_depth > 1 else "O(N)"
            explanation = "Recursive execution pattern detected."
        elif has_sort:
            time_comp = "O(N log N)"
            explanation = "Array sorting operation detected (O(N log N))."
        elif max_depth == 0:
            time_comp = "O(1)"
            explanation = "No loops detected. Constant execution time O(1)."
        elif max_depth == 1:
            time_comp = "O(N)"
            explanation = "Single loop or map iteration detected (O(N))."
        elif max_depth == 2:
            time_comp = "O(N^2)"
            explanation = "Nested loop iteration detected (O(N^2))."
        else:
            time_comp = f"O(N^{max_depth})"
            explanation = f"Multi-level nested loops ({max_depth} levels) detected."

        space_comp = "O(N)" if (has_array or has_recursion) else "O(1)"
        return ComplexityResult(
            time_complexity=time_comp,
            space_complexity=space_comp,
            explanation=f"{explanation} Space complexity: {space_comp}.",
        )

    def _analyze_csharp(self, code: str) -> ComplexityResult:
        loop_patterns = [r'\bfor\s*\(', r'\bforeach\s*\(', r'\bwhile\s*\(', r'\bdo\s*\{']
        max_depth = 0
        current_depth = 0

        for line in code.splitlines():
            if any(re.search(p, line) for p in loop_patterns):
                current_depth += 1
                max_depth = max(max_depth, current_depth)
            if '}' in line and current_depth > 0:
                current_depth -= 1

        has_sort = bool(re.search(r'\bArray\.Sort\b|\bList<.*>\.Sort\b|\b\.OrderBy\b', code))
        has_collections = bool(re.search(r'\bnew\s+(List|Dictionary|HashSet|int\[\]|string\[\])\b', code))

        if has_sort:
            time_comp = "O(N log N)"
            explanation = "Sorting operation detected (O(N log N))."
        elif max_depth == 0:
            time_comp = "O(1)"
            explanation = "Constant time O(1): linear statement block."
        elif max_depth == 1:
            time_comp = "O(N)"
            explanation = "Single loop level detected (O(N))."
        elif max_depth == 2:
            time_comp = "O(N^2)"
            explanation = "Nested loops detected (O(N^2))."
        else:
            time_comp = f"O(N^{max_depth})"
            explanation = f"Polynomial loop hierarchy detected ({max_depth} levels)."

        space_comp = "O(N)" if has_collections else "O(1)"
        return ComplexityResult(
            time_complexity=time_comp,
            space_complexity=space_comp,
            explanation=f"{explanation} Space complexity: {space_comp}.",
        )

    def _fallback_analysis(self, code: str) -> ComplexityResult:
        lines = len(code.splitlines())
        if lines < 15:
            return ComplexityResult("O(1)", "O(1)", "Short code snippet; estimated constant time & space.")
        return ComplexityResult("O(N)", "O(1)", "Iterative execution flow; estimated linear time complexity.")


complexity_analyzer = ComplexityAnalyzer()
