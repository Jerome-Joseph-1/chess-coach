import random

import chess
import chess.engine
import pytest

from chessutil import bucket, first_capture_square, material, passed, quiet_line, sample, to_win, win
from helpers import uci_line

START = chess.STARTING_FEN
AFTER_EXD5 = "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2"


def test_win_is_even_at_zero_and_symmetric():
    assert win(0) == pytest.approx(50)
    assert win(150) + win(-150) == pytest.approx(100)


def test_win_grows_with_centipawns_and_is_capped_at_a_thousand():
    assert win(-100) < win(0) < win(100) < win(300)
    assert win(5000) == win(1000)
    assert win(-5000) == win(-1000)


def test_to_win_reads_the_score_from_the_given_side():
    score = chess.engine.PovScore(chess.engine.Cp(120), chess.WHITE)
    assert to_win(score, chess.WHITE) == pytest.approx(win(120))
    assert to_win(score, chess.BLACK) == pytest.approx(win(-120))


def test_to_win_treats_mate_as_decided():
    mate_for_white = chess.engine.PovScore(chess.engine.Mate(3), chess.WHITE)
    assert to_win(mate_for_white, chess.WHITE) == 100.0
    assert to_win(mate_for_white, chess.BLACK) == 0.0


@pytest.mark.parametrize("win_pct, expected", [
    (100, 0), (85, 0), (84.9, 1), (70, 1), (60, 2), (57, 2), (50, 3), (43, 3), (42.9, 4), (30, 4), (20, 5), (14.9, 6), (0, 6),
])
def test_bucket_cuts(win_pct, expected):
    assert bucket(win_pct) == expected


def test_material_is_zero_at_the_start_and_counts_the_difference():
    assert material(chess.Board(), chess.WHITE) == 0
    board = chess.Board(AFTER_EXD5)
    assert material(board, chess.WHITE) == 1
    assert material(board, chess.BLACK) == -1


def test_material_counts_pieces_by_value():
    board = chess.Board("4k3/8/8/8/8/8/8/R2QK1N1 w - - 0 1")
    assert material(board, chess.WHITE) == 5 + 9 + 3


def test_passed_hands_the_move_over_without_touching_the_original():
    board = chess.Board()
    skipped = passed(board)
    assert skipped.turn == chess.BLACK
    assert skipped.board_fen() == board.board_fen()
    assert board.turn == chess.WHITE and not board.move_stack


def test_quiet_line_always_plays_the_minimum_plies():
    ucis = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "e1g1", "g8f6"]
    out, _ = quiet_line(chess.Board(), ucis)
    assert out == ucis[:6]


def test_quiet_line_continues_through_captures_then_stops():
    ucis = uci_line("e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 Nxe5 Qd4 Nxc6")
    out, end = quiet_line(chess.Board(), ucis)
    assert out == ucis[:9]
    assert end.piece_at(chess.E5) == chess.Piece(chess.KNIGHT, chess.WHITE)


def test_quiet_line_stops_at_the_first_quiet_move():
    out, end = quiet_line(chess.Board(AFTER_EXD5), ["d8d5", "b1c3", "d5a5"], min_plies=0)
    assert out == ["d8d5"]
    assert end.turn == chess.WHITE


def test_quiet_line_stops_at_an_illegal_move():
    out, _ = quiet_line(chess.Board(), ["e2e4", "e2e4", "g1f3"], min_plies=6)
    assert out == ["e2e4"]


def test_quiet_line_leaves_the_given_board_alone():
    board = chess.Board()
    quiet_line(board, ["e2e4", "e7e5"])
    assert board.fen() == START


def test_first_capture_square_names_where_the_side_first_captures():
    line = uci_line("e4 d5 exd5 Qxd5 Nc3")
    assert first_capture_square(chess.Board(), line, chess.WHITE) == "d5"
    assert first_capture_square(chess.Board(), line[:2], chess.WHITE) is None


def test_first_capture_square_skips_the_other_sides_captures():
    board = chess.Board(AFTER_EXD5)
    assert first_capture_square(board, ["d8d5", "b1c3"], chess.WHITE) is None
    assert first_capture_square(board, ["d8d5", "b1c3"], chess.BLACK) == "d5"


class FixedRandom:
    def __init__(self, value):
        self.value = value

    def random(self):
        return self.value


def test_sample_ignores_moves_below_the_floor():
    rng = random.Random(1)
    weights = {"e2e4": 0.9, "a2a3": 0.005}
    assert {sample(rng, weights, 0.02) for _ in range(50)} == {"e2e4"}


def test_sample_falls_back_to_everything_when_nothing_clears_the_floor():
    weights = {"e2e4": 0.01, "d2d4": 0.01}
    assert sample(random.Random(1), weights, 0.5) in weights


def test_sample_walks_the_weights_in_order():
    weights = {"e2e4": 0.5, "d2d4": 0.3, "g1f3": 0.2}
    assert sample(FixedRandom(0.0), weights, 0) == "e2e4"
    assert sample(FixedRandom(0.6), weights, 0) == "d2d4"
    assert sample(FixedRandom(0.999), weights, 0) == "g1f3"
