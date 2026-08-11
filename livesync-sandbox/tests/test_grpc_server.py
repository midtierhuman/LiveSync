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


def test_grpc_execute_code(servicer):
    req = sandbox_pb2.ExecutionRequest(
        language="python",
        code="print('gRPC Hello World')",
        timeout_ms=5000
    )
    res = servicer.ExecuteCode(req, None)
    assert res.is_success is True
    assert res.exit_code == 0
    assert "gRPC Hello World" in res.stdout


def test_grpc_search_packages(servicer):
    req = sandbox_pb2.PackageSearchRequest(
        package_manager="pypi",
        query="fastapi"
    )
    res = servicer.SearchPackages(req, None)
    assert res.query == "fastapi"
    assert len(res.packages) > 0
