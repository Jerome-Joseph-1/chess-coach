"""Analyse the opening lessons' curated trap positions into src/course/openings/traps.json (Stockfish only, run locally)."""
import json
from pathlib import Path
from typing import NamedTuple

import chess
import chess.engine

from chessutil import first_capture_square, quiet_line, stockfish_path, to_win, win
from label import HOLD, LOSS, analyse, turn_record
from openings import USER_SIDE

OUT = Path(__file__).parent.parent / "src" / "course" / "openings" / "traps.json"
# Added to every depth label.py asks for: there are only a dozen positions, so they can be read deeper.
DEEPER = 8
CHECK_DEPTH = 22
# A punished mistake must leave the user this many centipawns up after the answer, or mating.
PUNISH_GAIN = 200
# The best move that isn't the answer must lose at least this much win%, so the punishment is the move to find.
PUNISH_GAP = 5


class Trap(NamedTuple):
    id: str
    lesson: str
    role: str
    # SAN from move 1 up to the user's move.
    line: str
    answer: str
    # "avoid": don't play `trap`; "punish": the opponent's last move was the mistake.
    kind: str
    trap: str | None = None


TRAPS = [
    # The Blackburne Shilling: 3...Nd4 leaves e5, and 4.Nxe5? Qg5 hits the knight and g2.
    Trap("trap-italian-shilling", "italian-traps", "example", "e4 e5 Nf3 Nc6 Bc4 Nd4", "Nxd4", "avoid", "Nxe5"),
    Trap("trap-italian-shilling-f7", "italian-traps", "drill", "e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5", "O-O", "avoid", "Nxf7"),
    Trap("trap-italian-two-knights", "italian-traps", "drill", "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Nxe4", "Bxf7+", "punish"),
    Trap("trap-italian-bc5", "italian-traps", "drill", "e4 e5 Nf3 Nc6 Bc4 Bc5", "d3", "avoid", "Nxe5"),
    # Légal: after 5...Bh5? 6.Nxe5!, taking the queen walks into mate.
    Trap("trap-italian-legal", "italian-traps", "drill", "e4 e5 Nf3 Nc6 Bc4 d6 Nc3 Bg4 h3 Bh5 Nxe5 Bxd1", "Bxf7+", "punish"),
    Trap("trap-italian-d6-ng5", "italian-traps", "drill", "e4 e5 Nf3 Nc6 Bc4 d6 Ng5 Nf6", "Nxf7", "punish"),
    Trap("trap-caro-kann-qe2", "caro-kann-traps", "example", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2", "Ndf6", "avoid", "Ngf6"),
    Trap("trap-caro-kann-ng5", "caro-kann-traps", "drill", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Bc4 Ngf6 Ng5", "e6", "avoid", "h6"),
    Trap("trap-caro-kann-advance", "caro-kann-traps", "drill", "e4 c6 d4 d5 e5 Bf5 g4 Be4 f3 Bg6 h4", "h5", "avoid", "e6"),
    Trap("trap-caro-kann-qe2-h6", "caro-kann-traps", "drill",
         "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Bc4 Ngf6 Ng5 e6 Qe2", "Nb6", "avoid", "h6"),
    Trap("trap-caro-kann-exchange", "caro-kann-traps", "drill",
         "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3", "Qd7", "avoid", "e6"),
    # The Qd3 trap: 8...Nxe4?? 9.Qd8+! Kxd8 10.Bg5+ and mate next.
    Trap("trap-caro-kann-qd3", "caro-kann-traps", "drill",
         "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Qd3 e5 dxe5 Qa5+ Bd2 Qxe5 O-O-O", "Be7", "avoid", "Nxe4"),
]


class EngineAnalyst:
    """The Analyst interface on Stockfish alone, a few plies deeper; no human move shares."""

    level = 0

    def __init__(self):
        self.user = chess.WHITE
        self.engine = chess.engine.SimpleEngine.popen_uci(stockfish_path())
        self.engine.configure({"Threads": 4, "Hash": 256})

    def close(self):
        self.engine.quit()

    def human(self, board, rating):
        return {}, "Curated trap"

    def lines(self, board, depth, multipv, root_moves=None):
        limit = chess.engine.Limit(depth=depth + DEEPER)
        infos = self.engine.analyse(board, limit, multipv=multipv, root_moves=root_moves)
        return [(i["pv"][0].uci(), to_win(i["score"], self.user), [m.uci() for m in i["pv"]]) for i in infos if "pv" in i]

    def eval(self, board, depth):
        # From the FEN alone: the passed board's null move can't be sent to the engine.
        info = self.engine.analyse(chess.Board(board.fen()), chess.engine.Limit(depth=depth + DEEPER))
        return to_win(info["score"], self.user), [m.uci() for m in info.get("pv", [])]

    def checked(self, board, moves):
        """Each move's score from the user's side and its line, at the check depth; `moves` None for the best two."""
        limit = chess.engine.Limit(depth=CHECK_DEPTH)
        infos = self.engine.analyse(board, limit, multipv=len(moves) if moves else 2, root_moves=moves)
        return [(i["pv"][0].uci(), i["score"].pov(self.user), [m.uci() for m in i["pv"]]) for i in infos]


def replay(line):
    board = chess.Board()
    for san in line.split():
        board.push_san(san)
    return board


def win_of(score):
    if score.is_mate():
        return 100.0 if score.mate() > 0 else 0.0
    return win(score.score())


def ends_in_mate(board, ucis):
    end = board.copy()
    for uci in ucis:
        end.push_uci(uci)
    return end.is_checkmate()


def check(analyst, board, trap):
    """The asserts at the check depth; returns the checked moves as uci -> (score, line)."""
    answer = board.parse_san(trap.answer)
    lure = board.parse_san(trap.trap) if trap.trap else None
    top = analyst.checked(board, None)
    best = win_of(top[0][1])
    scored = {m: (s, pv) for m, s, pv in analyst.checked(board, [answer] + ([lure] if lure else []))}
    for move, (score, pv) in scored.items():
        assert not score.is_mate() or ends_in_mate(board, pv), f"{trap.id}: the line after {move} is scored as mate but doesn't mate"
    answer_score = scored[answer.uci()][0]
    answer_loss = best - win_of(answer_score)
    assert answer_loss <= HOLD, f"{trap.id}: {trap.answer} loses {answer_loss:.1f}"
    said = f"{trap.id}: {trap.answer} {answer_score} (loses {answer_loss:.1f})"
    if lure:
        lure_score = scored[lure.uci()][0]
        lure_loss = best - win_of(lure_score)
        assert lure_loss >= LOSS, f"{trap.id}: {trap.trap} loses only {lure_loss:.1f}"
        print(f"{said}; {trap.trap} {lure_score} (loses {lure_loss:.1f})")
    else:
        assert answer_score.score(mate_score=100000) >= PUNISH_GAIN, f"{trap.id}: {trap.answer} only reaches {answer_score}"
        move, score, _ = next(t for t in top if t[0] != answer.uci())
        gap = win_of(answer_score) - win_of(score)
        assert gap >= PUNISH_GAP, f"{trap.id}: {board.san(chess.Move.from_uci(move))} loses only {gap:.1f}"
        print(f"{said}; next best {board.san(chess.Move.from_uci(move))} {score} (loses {gap:.1f})")
    for move, (score, pv) in scored.items():
        print(f"    {board.variation_san([chess.Move.from_uci(u) for u in pv[:12]])}")
    return scored


def regrade(a, move, score, pv):
    """Puts a move's checked score and line in place of the shallower one."""
    a["wins"][move] = min(win_of(score), a["best"])
    a["loss"][move] = a["best"] - a["wins"][move]
    a["pvs"][move] = pv


def is_trigger(board, move):
    """The opponent's move captured, checked, or came into the user's half (as in generate.py)."""
    own_half = range(0, 4) if board.turn == chess.BLACK else range(4, 8)
    return board.is_capture(move) or board.gives_check(move) or chess.square_rank(move.to_square) in own_half


def trap_turn(analyst, board, trap, scored):
    """The turn as label.py writes it, then marked as this trap: the answer's line best, the trap's line the mistake."""
    user = board.turn
    last = board.pop()
    trigger = is_trigger(board, last)
    board.push(last)
    a = analyse(analyst, board, 50.0)
    for move, (score, pv) in scored.items():
        regrade(a, move, score, pv)
    answer = board.parse_san(trap.answer).uci()
    record = turn_record(board, a, user, answer, last, trigger)
    best_line, _ = quiet_line(board, a["pvs"][answer])
    record.update(label="gray", lines={"best": best_line}, kinds=["trap" if trap.kind == "avoid" else "win"])
    if trap.trap:
        lure = board.parse_san(trap.trap).uci()
        record["lines"]["mistake"], _ = quiet_line(board, a["pvs"][lure])
        record["mistakeMove"] = lure
        record["keySquares"] = sorted({lure[:2], lure[2:4]})
    else:
        record["keySquares"] = sorted({answer[:2], first_capture_square(board, best_line, user) or answer[2:4]})
    for move, (score, _) in scored.items():
        line = record["lines"]["best" if move == answer else "mistake"]
        assert not score.is_mate() or ends_in_mate(board, line), f"{trap.id}: the stored line after {move} stops before the mate"
    return {"ply": 0, "moveNo": board.fullmove_number, **record}


def trap_game(analyst, trap):
    board = replay(trap.line)
    opening = trap.lesson.removesuffix("-traps")
    side = USER_SIDE[opening]
    assert board.turn == (chess.WHITE if side == "w" else chess.BLACK), f"{trap.id}: not the user's move"
    analyst.user = board.turn
    turn = trap_turn(analyst, board, trap, check(analyst, board, trap))
    return {"id": trap.id, "opening": opening, "side": side, "start": trap.line.split(), "moves": [trap.answer],
            "turns": [turn], "lesson": trap.lesson, "role": trap.role}


def main():
    analyst = EngineAnalyst()
    try:
        games = [trap_game(analyst, trap) for trap in TRAPS]
    finally:
        analyst.close()
    text = "[\n" + ",\n".join(json.dumps(g, separators=(",", ":")) for g in games) + "\n]\n"
    OUT.write_text(text)
    print(f"Wrote {len(games)} trap positions to {OUT.name} ({len(text.encode()) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
