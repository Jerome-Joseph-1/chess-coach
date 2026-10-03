import chess
import pytest

from chessutil import passed
from helpers import FakeAnalyst, fen_after, uci_line
from label import analyse, most_common_mistake, refutation, scripted_move, turn_record

ITALIAN = "e4 e5 Nf3 Nc6 Bc4 Nf6"
HANGING_QUEEN = "rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3"
PAWN_FORK_ON_BISHOP = fen_after("e4 e5 Nf3 Nc6 Bc4 b5")
IN_CHECK = fen_after("d4 e6 e4 Bb4")


def italian_analyst(**overrides):
    """White to move after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6, where Bxf7+ is the move players keep getting wrong."""
    given = dict(
        wins={"f3g5": 60, "d2d3": 58, "b1c3": 57, "e1g1": 56, "c4f7": 20},
        human={"c4f7": 0.4, "d2d3": 0.3, "e1g1": 0.3},
        stronger={"f3g5": 0.6, "d2d3": 0.4},
    )
    return FakeAnalyst(**{**given, **overrides})


def italian_board():
    return chess.Board(fen_after(ITALIAN))


def test_label_is_critical_when_many_go_wrong_and_stronger_players_find_the_move():
    a = analyse(italian_analyst(), italian_board(), prev_win=60)
    assert a["label"] == "critical"
    assert a["wrong"] == pytest.approx(0.4)
    assert a["find"] == pytest.approx(1.0)
    assert sorted(a["holding"]) == ["d2d3", "f3g5"]


def test_label_is_nothing_when_there_is_no_mistake_to_make_and_no_threat():
    analyst = italian_analyst(human={"d2d3": 0.5, "e1g1": 0.5}, null_win=59)
    assert analyse(analyst, italian_board(), prev_win=59)["label"] == "nothing"


def test_label_is_gray_when_passing_would_lose_ground():
    analyst = italian_analyst(human={"d2d3": 0.5, "e1g1": 0.5}, null_win=45)
    a = analyse(analyst, italian_board(), prev_win=59)
    assert a["threat"] == pytest.approx(15)
    assert a["label"] == "gray"


def test_label_is_gray_after_a_gift_from_the_opponent():
    analyst = italian_analyst(human={"d2d3": 1.0}, null_win=59)
    assert analyse(analyst, italian_board(), prev_win=50)["label"] == "gray"


def test_label_is_gray_when_only_some_players_go_wrong():
    analyst = italian_analyst(human={"c4f7": 0.1, "d2d3": 0.9})
    assert analyse(analyst, italian_board(), prev_win=60)["label"] == "gray"


def test_label_is_gray_when_stronger_players_make_the_same_mistake():
    analyst = italian_analyst(stronger={"c4f7": 0.95})
    a = analyse(analyst, italian_board(), prev_win=60)
    assert a["find"] == 0
    assert a["label"] == "gray"


def test_a_big_slip_inside_the_same_verdict_is_not_wrong():
    analyst = italian_analyst(wins={"f3g5": 84, "d2d3": 83, "c4f7": 72}, human={"c4f7": 1.0}, stronger={"f3g5": 1.0})
    a = analyse(analyst, italian_board(), prev_win=84)
    assert a["loss"]["c4f7"] == pytest.approx(12)
    assert a["wrong"] == 0
    assert a["label"] != "critical"


def test_stronger_players_without_data_are_stood_in_for_by_the_level_below():
    analyst = italian_analyst(stronger={}, sources=("Lichess 1300-1500 (120 games)", "Maia-2 @1600"))
    a = analyse(analyst, italian_board(), prev_win=60)
    assert a["find"] == pytest.approx(0.3)
    assert a["label"] == "critical"


def test_a_grade_never_beats_the_best_line():
    analyst = italian_analyst(wins={"f3g5": 60, "d2d3": 58, "b1c3": 57, "e1g1": 56, "c4f7": 20, "a2a3": 61}, human={"a2a3": 1.0})
    a = analyse(analyst, italian_board(), prev_win=60)
    assert max(a["wins"].values()) <= a["best"]
    assert a["best"] == 61


def test_in_check_is_never_nothing_and_skips_the_threat_probe():
    board = chess.Board(IN_CHECK)
    analyst = FakeAnalyst(wins={"c2c3": 50, "b1c3": 49, "c1d2": 48}, human={"c2c3": 1.0}, stronger={"c2c3": 1.0}, null_win=0)
    a = analyse(analyst, board, prev_win=50)
    assert board.is_check()
    assert a["label"] == "gray"
    assert a["threat"] == 0.0


def test_scripted_move_in_a_critical_turn_is_the_best_one_stronger_players_find():
    a = analyse(italian_analyst(), italian_board(), prev_win=60)
    assert scripted_move(a, rng_sample=lambda weights: pytest.fail("should not sample")) == "f3g5"


def test_scripted_move_otherwise_samples_among_the_safe_human_moves():
    a = analyse(italian_analyst(human={"d2d3": 0.5, "e1g1": 0.4, "c4f7": 0.1}), italian_board(), prev_win=60)
    seen = {}
    scripted_move(a, rng_sample=lambda weights: seen.update(weights) or "d2d3")
    assert seen == {"d2d3": 0.5, "e1g1": 0.4}


def test_scripted_move_falls_back_to_the_best_move_when_humans_offer_none():
    a = analyse(italian_analyst(human={"c4f7": 1.0}), italian_board(), prev_win=60)
    assert scripted_move(a, rng_sample=lambda weights: pytest.fail("nothing to sample")) == "f3g5"


def test_most_common_mistake_is_the_likeliest_move_that_loses_ten_points():
    analyst = italian_analyst(wins={"f3g5": 60, "d2d3": 58, "c4f7": 20, "h2h3": 40}, human={"c4f7": 0.2, "h2h3": 0.5, "d2d3": 0.3})
    a = analyse(analyst, italian_board(), prev_win=60)
    assert most_common_mistake(a) == "h2h3"


def test_most_common_mistake_is_none_when_no_move_loses_enough():
    a = analyse(italian_analyst(human={"d2d3": 1.0}), italian_board(), prev_win=60)
    assert most_common_mistake(a) is None


def record_for(fen, analyst, prev_win, last_move=None):
    board = chess.Board(fen)
    a = analyse(analyst, board, prev_win)
    scripted = scripted_move(a, rng_sample=lambda weights: max(weights, key=weights.get))
    return turn_record(board, a, chess.WHITE, scripted, last_move, trigger=False)


def test_record_for_a_winning_tactic_names_the_capture():
    analyst = FakeAnalyst(
        wins={"e4d5": 90, "b1c3": 40, "g1f3": 42},
        human={"b1c3": 0.6, "g1f3": 0.3, "e4d5": 0.1},
        stronger={"e4d5": 0.8, "g1f3": 0.2},
        pvs={"e4d5": uci_line("exd5 Nf6 Nc3 Nc6 Nf3 e6", HANGING_QUEEN),
             "b1c3": uci_line("Nc3 Qd8 Nf3 Nc6 d4 Nf6", HANGING_QUEEN)},
    )
    record = record_for(HANGING_QUEEN, analyst, prev_win=60)
    assert record["label"] == "critical"
    assert record["kinds"] == ["win"]
    assert record["keySquares"] == ["d5", "e4"]
    assert record["mistakeMove"] == "b1c3"
    assert record["lines"]["best"][0] == "e4d5"
    assert record["lines"]["mistake"][0] == "b1c3"
    assert "threat" not in record["lines"]
    assert record["material"] == 1
    assert record["bestWin"] == 90.0
    assert record["fen"] == HANGING_QUEEN


def test_record_for_a_threat_asks_the_user_to_defend():
    board = chess.Board(PAWN_FORK_ON_BISHOP)
    analyst = FakeAnalyst(
        wins={"c4b3": 55, "d2d3": 30},
        human={"d2d3": 0.5, "c4b3": 0.5},
        stronger={"c4b3": 0.9, "d2d3": 0.1},
        pvs={"c4b3": uci_line("Bb3 a6 d3 Nf6 O-O Bc5", PAWN_FORK_ON_BISHOP),
             "d2d3": uci_line("d3 bxc4 dxc4 Nf6 Nc3 Bb4", PAWN_FORK_ON_BISHOP)},
        null_win=30,
        threat_pv=uci_line("bxc4 d3 Nf6", passed(board).fen()),
    )
    record = record_for(PAWN_FORK_ON_BISHOP, analyst, prev_win=55)
    assert record["label"] == "critical"
    assert record["kinds"] == ["defend"]
    assert record["keySquares"] == ["b5", "c4"]
    assert record["lines"]["threat"] == ["b5c4", "d2d3"]


def test_record_for_a_quiet_trap_marks_the_mistake_squares():
    analyst = italian_analyst(pvs={
        "d2d3": uci_line("d3 Bc5 c3 d6 O-O O-O", fen_after(ITALIAN)),
        "c4f7": uci_line("Bxf7+ Kxf7 Nxe5+ Nxe5 d4 Bd6", fen_after(ITALIAN)),
    })
    record = record_for(fen_after(ITALIAN), analyst, prev_win=60)
    assert record["label"] == "critical"
    assert record["kinds"] == ["trap"]
    assert record["keySquares"] == ["c4", "f7"]
    assert record["mistakeMove"] == "c4f7"


def test_a_critical_turn_whose_mistake_costs_no_material_is_downgraded():
    analyst = italian_analyst(
        wins={"f3g5": 60, "d2d3": 58, "a2a3": 20},
        human={"a2a3": 0.5, "d2d3": 0.5},
        pvs={"d2d3": uci_line("d3 Bc5 c3 d6 O-O O-O", fen_after(ITALIAN)),
             "a2a3": uci_line("a3 d6 d3 Be6 b4 Be7", fen_after(ITALIAN))},
    )
    record = record_for(fen_after(ITALIAN), analyst, prev_win=60)
    assert record["label"] == "gray"
    assert record["kinds"] == [] and record["keySquares"] == [] and record["mistakeMove"] is None


def test_record_lists_likely_moves_and_refutations_of_costly_ones():
    analyst = italian_analyst(
        human={"d2d3": 0.5, "e1g1": 0.3, "c4f7": 0.19, "h2h3": 0.01},
        pvs={"c4f7": ["c4f7", "e8f7", "f3e5"]},
    )
    record = record_for(fen_after(ITALIAN), analyst, prev_win=60)
    assert [m["uci"] for m in record["human"]] == ["d2d3", "e1g1", "c4f7"]
    assert record["human"][0] == {"uci": "d2d3", "share": 0.5}
    assert record["refutations"] == {"c4f7": ["e8f7", "f3e5"]}
    assert record["grades"]["c4f7"] == 40.0
    assert record["inCheck"] is False


def test_refutation_follows_the_answer_until_the_captures_stop():
    board = chess.Board()
    pv = ["e2e4", "d7d5", "e4d5", "d8d5", "b1c3", "d5a5", "d2d4", "g8f6", "c1d2"]
    assert refutation(board, pv) == pv[1:6]
    trade = ["e2e4", "d7d5", "g1f3", "b8c6", "f1b5", "c8g4", "e4d5", "g4f3", "d5c6"]
    assert refutation(board, trade) == trade[1:]
