import pytest
from app.grpc_server import SandboxServiceServicer
from app.pb import sandbox_pb2


@pytest.fixture
def servicer():
    return SandboxServiceServicer()


def test_multifile_python_execution(servicer):
    files = {
        "utils/math.py": "def add(a, b):\n    return a + b\n",
        "main.py": "from utils.math import add\nprint('SUM:', add(10, 32))\n",
    }
    req = sandbox_pb2.ExecutionRequest(
        language="python",
        code="",
        files=files,
        entrypoint="main.py",
        timeout_ms=5000,
    )
    res = servicer.ExecuteCode(req, None)
    assert res.is_success is True
    assert res.exit_code == 0
    assert "SUM: 42" in res.stdout


def test_multifile_node_execution(servicer):
    files = {
        "helper.js": "module.exports = { greet: (name) => `Hello, ${name}!` };\n",
        "index.js": "const { greet } = require('./helper');\nconsole.log(greet('LiveSync MultiFile'));\n",
    }
    req = sandbox_pb2.ExecutionRequest(
        language="javascript",
        code="",
        files=files,
        entrypoint="index.js",
        timeout_ms=5000,
    )
    res = servicer.ExecuteCode(req, None)
    assert res.is_success is True
    assert res.exit_code == 0
    assert "Hello, LiveSync MultiFile!" in res.stdout
