import chess
import chess.engine
import pytest

import label
from chessutil import to_win
from helpers import CannedHumans, fen_after
from label import analyse, scripted_move

DEPTH = 6
HANGING_QUEEN = "rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3"
MATE_IN_ONE = fen_after("f3 e5 g4")


class EngineAnalyst(CannedHumans):
    """Grades from a real engine, move shares still canned."""

    def __init__(self, engine, human, stronger):
        super().__init__(human, stronger)
        self.engine = engine

    def lines(self, board, depth, multipv, root_moves=None):
        infos = self.engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multipv, root_moves=root_moves)
        return [(i["pv"][0].uci(), to_win(i["score"], chess.WHITE), [m.uci() for m in i["pv"]]) for i in infos if "pv" in i]

    def eval(self, board, depth):
        info = self.engine.analyse(board, chess.engine.Limit(depth=depth))
        return to_win(info["score"], chess.WHITE), [m.uci() for m in info.get("pv", [])]


@pytest.fixture
def shallow(monkeypatch):
    for name in ("DEPTH_TOP", "DEPTH_HUMAN", "DEPTH_REST", "DEPTH_THREAT"):
        monkeypatch.setattr(label, name, DEPTH)


def test_to_win_sees_a_mate_in_one(engine):
    info = engine.analyse(chess.Board(MATE_IN_ONE), chess.engine.Limit(depth=DEPTH))
    assert to_win(info["score"], chess.BLACK) == 100.0
    assert to_win(info["score"], chess.WHITE) == 0.0


def test_hanging_queen_is_a_critical_turn_when_most_players_miss_it(engine, shallow):
    analyst = EngineAnalyst(engine, human={"b1c3": 0.7, "g1f3": 0.3}, stronger={"e4d5": 0.8, "g1f3": 0.2})
    board = chess.Board(HANGING_QUEEN)
    a = analyse(analyst, board, prev_win=60)
    assert a["label"] == "critical"
    assert scripted_move(a, rng_sample=lambda weights: pytest.fail("should not sample")) == "e4d5"
    assert a["wins"]["e4d5"] > a["wins"]["b1c3"] + 15
