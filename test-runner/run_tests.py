import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path

# Add livesync-sandbox directory to sys.path so app modules can be imported
project_root = Path(__file__).resolve().parents[1]
sandbox_dir = str(project_root / "livesync-sandbox")
if sandbox_dir not in sys.path:
    sys.path.insert(0, sandbox_dir)

# Ensure UTF-8 output in Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import websockets
except ImportError:
    print("Installing 'websockets' dependency for test runner...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
    import websockets

try:
    import httpx
except ImportError:
    print("Installing 'httpx' dependency for test runner...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "httpx"])
    import httpx

SANDBOX_URL = "http://localhost:8080"
WS_SANDBOX_URL = "ws://localhost:8080/api/execution/stream"
API_URL = "http://localhost:5038"

NUMBER_GUESSING_GAME = """import random

def play_game():
    print("=" * 40)
    print("Welcome to the Number Guessing Game!")
    print("=" * 40)
    print("I am thinking of a number between 1 and 100.")
    
    secret_number = 50
    attempts = 0
    
    while True:
        try:
            guess = input("\\nEnter your guess (or type 'exit' to quit): ")
            
            if guess.lower() == 'exit':
                print(f"The secret number was {secret_number}. Thanks for playing!")
                break
                
            guess = int(guess)
            attempts += 1
            
            if guess < 1 or guess > 100:
                print("Out of bounds! Please guess a number between 1 and 100.")
            elif guess < secret_number:
                print("Too low! 📉 Try a higher number.")
            elif guess > secret_number:
                print("Too high! 📈 Try a lower number.")
            else:
                print(f"\\n🎉 Congratulations! You guessed it in {attempts} attempts!")
                break
                
        except ValueError:
            print("Invalid input! Please enter a valid whole number.")

if __name__ == "__main__":
    play_game()
"""


async def test_rest_execution(client: httpx.AsyncClient) -> bool:
    print("\n" + "=" * 60)
    print("🧪 TEST 1: REST Non-Interactive Endpoint (/api/execution/run)")
    print("=" * 60)

    payload = {
        "language": "python",
        "code": "print('Hello from LiveSync Sandbox!')\nprint(2 + 2)",
        "timeout_ms": 5000,
    }

    try:
        response = await client.post(f"{SANDBOX_URL}/api/execution/run", json=payload)
        if response.status_code == 200:
            data = response.json()
            print("✅ Status:", data.get("status"))
            print("✅ Success:", data.get("isSuccess"))
            print("📄 Standard Output:\n", data.get("standardOutput", "").strip())
            print(f"⏱️ Duration: {data.get('executionDurationMs')} ms")
            return data.get("isSuccess") is True
        else:
            print(f"❌ Failed with status code {response.status_code}: {response.text}")
            return False
    except Exception as ex:
        print(f"⚠️ REST request error: {ex}")
        return False


async def test_websocket_interactive_stream() -> bool:
    print("\n" + "=" * 60)
    print("🧪 TEST 2: WebSocket Stateful Interactive Stream (/api/execution/stream)")
    print("=" * 60)

    try:
        async with websockets.connect(WS_SANDBOX_URL) as ws:
            init_msg = {
                "action": "start",
                "language": "python",
                "code": NUMBER_GUESSING_GAME,
                "timeoutMs": 15000,
            }
            await ws.send(json.dumps(init_msg))
            print("📤 Sent 'start' action with code snippet...")

            first_resp = await ws.recv()
            status_data = json.loads(first_resp)
            print("📥 Received status:", status_data)

            inputs = ["25\n", "75\n", "50\n"]
            received_outputs = []

            async def send_inputs():
                for user_input in inputs:
                    await asyncio.sleep(0.3)
                    print(f"💬 Sending user input: {user_input.strip()!r}")
                    await ws.send(json.dumps({"action": "stdin", "data": user_input}))

            input_task = asyncio.create_task(send_inputs())

            exit_payload = None
            while True:
                try:
                    msg_text = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    msg = json.loads(msg_text)
                    msg_type = msg.get("type")

                    if msg_type == "stdout":
                        data = msg.get("data", "")
                        received_outputs.append(data)
                        sys.stdout.write(f"[STREAM STDOUT] {data}")
                        sys.stdout.flush()
                    elif msg_type == "stderr":
                        sys.stderr.write(f"[STREAM STDERR] {msg.get('data')}")
                        sys.stderr.flush()
                    elif msg_type == "exit":
                        exit_payload = msg
                        print("\n\n🏁 Received 'exit' payload:")
                        print(json.dumps(exit_payload, indent=2))
                        break
                    elif msg_type == "error":
                        print("\n❌ Received error message:", msg.get("message"))
                        break
                except asyncio.TimeoutError:
                    print("\n⏳ Stream receive timeout.")
                    break

            await input_task

            combined = "".join(received_outputs)
            has_too_low = "Too low! 📉" in combined
            has_too_high = "Too high! 📈" in combined
            has_congrats = "🎉 Congratulations!" in combined

            print("\n" + "-" * 40)
            print("VERIFICATION CHECKLIST:")
            print(f"  - Low guess emoji (Too low! 📉): {'✅ PASS' if has_too_low else '❌ FAIL'}")
            print(f"  - High guess emoji (Too high! 📈): {'✅ PASS' if has_too_high else '❌ FAIL'}")
            print(f"  - Completion emoji (🎉 Congrats): {'✅ PASS' if has_congrats else '❌ FAIL'}")
            print(f"  - Exit code == 0: {'✅ PASS' if exit_payload and exit_payload.get('exitCode') == 0 else '❌ FAIL'}")

            return bool(exit_payload and exit_payload.get("exitCode") == 0 and has_congrats)

    except Exception as ex:
        print(f"⚠️ WebSocket stream error: {ex}")
        return False


def run_sandbox_pytest_suite() -> bool:
    print("\n" + "=" * 60)
    print("🧪 TEST 3: Sandbox Pytest Suite (In-Process Unit Tests)")
    print("=" * 60)
    try:
        res = subprocess.run(
            [sys.executable, "-m", "pytest", str(project_root / "livesync-sandbox" / "tests")],
            capture_output=True,
            text=True,
        )
        print(res.stdout)
        if res.returncode == 0:
            print("✅ Pytest suite passed successfully!")
            return True
        else:
            print(res.stderr)
            print("❌ Pytest suite failed.")
            return False
    except Exception as ex:
        print(f"⚠️ Pytest execution error: {ex}")
        return False


async def run_in_process_test() -> bool:
    print("\nExecuting Direct In-Process Sandbox Component Verification...")
    from app.services.streaming_executor import streaming_executor_service

    class MockWS:
        def __init__(self, script_inputs):
            self.inputs = script_inputs
            self.idx = 0
            self.outputs = []

        async def accept(self):
            pass

        async def send_json(self, d):
            self.outputs.append(d)
            if d.get("type") == "stdout":
                sys.stdout.write(d.get("data", ""))
                sys.stdout.flush()
            elif d.get("type") == "stderr":
                sys.stderr.write(d.get("data", ""))
                sys.stderr.flush()

        async def receive_text(self):
            if self.idx < len(self.inputs):
                item = self.inputs[self.idx]
                self.idx += 1
                return json.dumps(item)
            await asyncio.sleep(3600)
            return ""

        async def close(self, code=1000):
            pass

    class MockAuth:
        def get_websocket_token(self, d):
            return "t"

        def validate_token(self, t):
            return True

    mock_inputs = [
        {"action": "start", "language": "python", "code": NUMBER_GUESSING_GAME, "timeoutMs": 10000},
        {"action": "stdin", "data": "25\n"},
        {"action": "stdin", "data": "75\n"},
        {"action": "stdin", "data": "50\n"},
    ]
    mws = MockWS(mock_inputs)
    await streaming_executor_service.handle_websocket_session(mws, MockAuth())

    exit_m = next((m for m in mws.outputs if m.get("type") == "exit"), None)
    if exit_m and exit_m.get("isSuccess"):
        print("\n✅ In-Process Component Test Passed Successfully!")
        return True
    return False


async def main():
    parser = argparse.ArgumentParser(description="LiveSync Component & Pre-Deploy Test Runner")
    parser.add_argument("--predeploy", action="store_true", help="Run full pre-deployment test suite")
    args = parser.parse_args()

    print("🚀 LiveSync Sandbox Component Test Runner")
    print(f"Targeting HTTP: {SANDBOX_URL}")

    is_server_up = False
    async with httpx.AsyncClient() as client:
        try:
            health = await client.get(f"{SANDBOX_URL}/health", timeout=2.0)
            if health.status_code == 200:
                print(f"💚 Live Sandbox Server Health: {health.json()}")
                is_server_up = True
        except Exception:
            is_server_up = False

        results = []
        if is_server_up:
            results.append(await test_rest_execution(client))
            results.append(await test_websocket_interactive_stream())
        else:
            print(f"ℹ️ Local server on {SANDBOX_URL} is not currently running.")
            print("Running in-process component verification instead...")
            results.append(await run_in_process_test())

        # Run Pytest suite
        results.append(run_sandbox_pytest_suite())

        all_passed = all(results)
        print("\n" + "=" * 60)
        if all_passed:
            print("🎉 ALL COMPONENT & PRE-DEPLOYMENT TESTS PASSED!")
        else:
            print("⚠️ TEST SUITE COMPLETED WITH ISSUES.")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
