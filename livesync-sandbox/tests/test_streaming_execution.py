import asyncio
import json
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.streaming_executor import streaming_executor_service


class DummyWebSocket:
    def __init__(self, inputs):
        self.inputs = inputs
        self.input_index = 0
        self.sent_messages = []
        self.is_closed = False

    async def accept(self):
        pass

    async def send_json(self, data):
        self.sent_messages.append(data)

    async def receive_text(self):
        if self.input_index < len(self.inputs):
            msg = self.inputs[self.input_index]
            self.input_index += 1
            return json.dumps(msg)
        await asyncio.sleep(3600)
        return ""

    async def close(self, code=1000):
        self.is_closed = True


class MockAuthService:
    def get_websocket_token(self, data):
        return "test-token"

    def validate_token(self, token):
        return True


NUMBER_GUESSING_GAME_STREAM = """
import random

def play_game():
    secret_number = 50
    attempts = 0

    while True:
        try:
            guess = input("Enter guess: ")
            if guess.lower() == 'exit':
                break
            guess = int(guess)
            attempts += 1
            if guess < secret_number:
                print("Too low! 📉")
            elif guess > secret_number:
                print("Too high! 📈")
            else:
                print(f"🎉 Congratulations! You guessed it in {attempts} attempts!")
                break
        except ValueError:
            print("Invalid input!")

if __name__ == "__main__":
    play_game()
"""


@pytest.mark.asyncio
async def test_python_streaming_interactive_execution():
    inputs = [
        {"action": "start", "language": "python", "code": NUMBER_GUESSING_GAME_STREAM, "timeoutMs": 10000},
        {"action": "stdin", "data": "25\n"},
        {"action": "stdin", "data": "75\n"},
        {"action": "stdin", "data": "50\n"},
    ]

    ws = DummyWebSocket(inputs)
    await streaming_executor_service.handle_websocket_session(ws, MockAuthService())

    # Verify WebSocket messages sent
    exit_msg = next((msg for msg in ws.sent_messages if msg.get("type") == "exit"), None)
    assert exit_msg is not None
    assert exit_msg.get("isSuccess") is True
    assert exit_msg.get("exitCode") == 0

    stdout_msgs = [msg.get("data", "") for msg in ws.sent_messages if msg.get("type") == "stdout"]
    combined_stdout = "".join(stdout_msgs)
    assert "Too low! 📉" in combined_stdout
    assert "Too high! 📈" in combined_stdout
    assert "🎉 Congratulations!" in combined_stdout
