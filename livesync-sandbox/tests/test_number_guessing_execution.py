import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.execution import SandboxExecutionRequest
from app.services.executor_service import executor_service


NUMBER_GUESSING_GAME = """
import random

def play_game():
    print("Welcome to the Number Guessing Game!")
    secret_number = random.randint(1, 100)
    attempts = 0

    while True:
        try:
            guess = int(input("Guess a number between 1 and 100: "))
            attempts += 1

            if guess < secret_number:
                print("Too low! Try again.")
            elif guess > secret_number:
                print("Too high! Try again.")
            else:
                print(f"You win! You found it in {attempts} attempts.")
                break
        except ValueError:
            print("Please enter a valid number.")

play_game()
"""


@pytest.mark.asyncio
async def test_python_number_guessing_game_executes_successfully():
    stdin_values = "\n".join(str(i) for i in range(1, 101))
    request = SandboxExecutionRequest(
        language="python",
        code=NUMBER_GUESSING_GAME,
        standard_input=stdin_values,
        timeout_ms=15000,
    )

    result = await executor_service.execute(request)

    assert result.is_success is True
    assert result.exit_code == 0
    assert "You win! You found it in" in (result.standard_output or "")
