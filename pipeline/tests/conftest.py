import os

import chess.engine
import pytest

from chessutil import stockfish_path


@pytest.fixture
def engine():
    """A Stockfish process, or a skip when the binary is not installed."""
    path = stockfish_path()
    if not os.path.exists(path):
        pytest.skip("stockfish is not installed")
    process = chess.engine.SimpleEngine.popen_uci(path)
    yield process
    process.quit()
