import pytest
from app.grpc_server import SandboxServiceServicer
from app.pb import sandbox_pb2


@pytest.fixture
def servicer():
    return SandboxServiceServicer()


def test_grpc_get_languages(servicer):
    req = sandbox_pb2.Empty()
    res = servicer.GetLanguages(req, None)
    assert len(res.languages) > 0
    names = [l.name for l in res.languages]
    assert "python" in names


def test_grpc_analyze_code(servicer):
    req = sandbox_pb2.AiAnalysisRequest(
        action="explain",
        language="python",
        code="def add(a, b):\n    return a + b\n"
    )
    res = servicer.AnalyzeCode(req, None)
    assert res.action == "explain"
    assert res.language == "python"
    assert len(res.explanation) > 0
    assert "add" in res.explanation

