"""Static check + exec of brain-agent controller source. AST whitelist, then exec
in a namespace with only math and numpy."""
from __future__ import annotations

import ast
import math

ALLOWED_IMPORTS = {"math", "numpy"}
FORBIDDEN_NAMES = {"open", "exec", "eval", "compile", "__import__", "input", "globals", "locals", "getattr", "setattr", "delattr", "breakpoint"}


def static_check(src: str) -> tuple[bool, str]:
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        return False, f"syntax error: {e}"
    has_cls = False
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [a.name.split(".")[0] for a in node.names] if isinstance(node, ast.Import) else [(node.module or "").split(".")[0]]
            bad = [n for n in names if n not in ALLOWED_IMPORTS]
            if bad:
                return False, f"forbidden import: {bad}"
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            return False, f"forbidden name: {node.id}"
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            return False, f"dunder attribute access: {node.attr}"
        if isinstance(node, ast.ClassDef) and node.name == "Controller":
            has_cls = True
            methods = {n.name for n in node.body if isinstance(n, ast.FunctionDef)}
            if "step" not in methods or "__init__" not in methods:
                return False, "Controller needs __init__ and step"
    if not has_cls:
        return False, "no class Controller"
    return True, "ok"


def instantiate(src: str, robot_info: dict):
    import numpy as np
    safe_builtins = {k: __builtins__[k] if isinstance(__builtins__, dict) else getattr(__builtins__, k)
                     for k in ("abs", "min", "max", "len", "range", "float", "int", "list", "dict", "tuple", "enumerate", "zip", "sum", "round", "bool", "isinstance", "sorted", "map", "any", "all", "print", "Exception", "ValueError")}
    def _imp(name, *a, **k):
        if name.split(".")[0] not in ALLOWED_IMPORTS:
            raise ImportError(f"import of {name!r} not allowed")
        return {"math": math, "numpy": np}[name.split(".")[0]]

    safe_builtins["__import__"] = _imp
    import builtins
    safe_builtins["__build_class__"] = builtins.__build_class__
    safe_builtins["__name__"] = "controller"
    ns = {"__builtins__": safe_builtins, "math": math, "np": np, "numpy": np}
    exec(compile(src, "<controller>", "exec"), ns)
    return ns["Controller"](robot_info)
