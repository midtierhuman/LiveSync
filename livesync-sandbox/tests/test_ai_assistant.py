import os
from unittest.mock import patch
from app.services.ai_assistant import ai_assistant_service, AiAnalysisResult


def test_ai_assistant_local_llm():
    code_snippet = "def multiply(a: int, b: int) -> int:\n    return a * b"
    res = ai_assistant_service.analyze(
        action="explain",
        language="python",
        code=code_snippet,
        custom_prompt="Explain what this multiplication function does."
    )

    assert res is not None
    assert isinstance(res, AiAnalysisResult)
    assert res.action == "explain"
    assert res.language == "python"
    assert isinstance(res.explanation, str)
    assert len(res.explanation) > 0
    assert isinstance(res.suggestions, list)


def test_ai_assistant_strict_local_failure():
    # Force connection error with fallbacks disabled
    with patch("app.services.ai_assistant.settings.local_llm_url", "http://127.0.0.1:59999"):
        with patch.dict(os.environ, {"LOCAL_LLM_URL": "http://127.0.0.1:59999"}):
            with patch("urllib.request.urlopen", side_effect=OSError("Connection refused")):
                res = ai_assistant_service.analyze("explain", "python", "x = 1")
                assert res is not None
                assert "Local LLM Error" in res.explanation


def test_ai_assistant_local_llm_model_payload():
    import json
    from unittest.mock import MagicMock

    mock_response = MagicMock()
    mock_response.__enter__.return_value = mock_response
    mock_response.read.return_value = json.dumps({
        "choices": [{
            "message": {
                "content": json.dumps({
                    "explanation": "Test explanation",
                    "suggestions": ["Test suggestion"],
                    "generated_code": None
                })
            }
        }]
    }).encode("utf-8")

    captured_requests = []

    def fake_urlopen(req, timeout=None):
        captured_requests.append(req)
        return mock_response

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        # 1. Default configured model
        res = ai_assistant_service.analyze("explain", "python", "x = 42")
        assert res is not None
        assert res.provider == "Local LLM (Qwen2.5-Coder-14B-Instruct-Q4_K_M)"
        payload1 = json.loads(captured_requests[0].data.decode("utf-8"))
        assert payload1.get("model") == "Qwen2.5-Coder-14B-Instruct-Q4_K_M"

        # 2. Custom passed model
        res_custom = ai_assistant_service.analyze("explain", "python", "x = 42", model="Custom-Qwen-Model")
        assert res_custom is not None
        assert res_custom.provider == "Local LLM (Custom-Qwen-Model)"
        payload2 = json.loads(captured_requests[1].data.decode("utf-8"))
        assert payload2.get("model") == "Custom-Qwen-Model"

