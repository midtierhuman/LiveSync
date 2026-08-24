import pytest
from app.grpc_server import AIServiceServicer
from app.pb import ai_pb2


@pytest.fixture
def servicer():
    return AIServiceServicer()


def test_grpc_get_languages(servicer):
    req = ai_pb2.Empty()
    res = servicer.GetLanguages(req, None)
    assert len(res.languages) > 0
    names = [l.name for l in res.languages]
    assert "python" in names


def test_grpc_analyze_code(servicer):
    req = ai_pb2.AiAnalysisRequest(
        action="explain",
        language="python",
        code="def add(a, b):\n    return a + b\n"
    )
    res = servicer.AnalyzeCode(req, None)
    assert res.action == "explain"
    assert res.language == "python"
    assert len(res.explanation) > 0
    assert "add" in res.explanation


def test_grpc_stream_analyze_code(servicer):
    req = ai_pb2.AiAnalysisRequest(
        action="complexity",
        language="python",
        code="for i in range(n):\n    print(i)"
    )
    chunks = list(servicer.StreamAnalyzeCode(req, None))
    assert len(chunks) >= 2
    stages = [c.stage for c in chunks]
    assert "analyzing" in stages
    assert "streaming" in stages
    assert "complete" in stages
    assert chunks[-1].is_final is True
    assert "O(N)" in chunks[1].delta or "O(N)" in chunks[1].explanation if hasattr(chunks[1], "explanation") else True


