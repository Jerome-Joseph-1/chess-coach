import math
import os
import shutil

import chess

VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
# Win% cut-offs between verdicts: winning, clearly better, a bit better, equal, a bit worse, clearly worse, losing.
BUCKETS = [85, 70, 57, 43, 30, 15]


def stockfish_path():
    return os.environ.get("STOCKFISH") or shutil.which("stockfish") or "/usr/games/stockfish"


def win(cp):
    cp = max(-1000, min(1000, cp))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def to_win(score, color):
    s = score.pov(color)
    if s.is_mate():
        return 100.0 if s.mate() > 0 else 0.0
    return win(s.score())


def bucket(win_pct):
    return sum(1 for cut in BUCKETS if win_pct < cut)


def material(board, side):
    return sum(v * (len(board.pieces(p, side)) - len(board.pieces(p, not side))) for p, v in VALUES.items())


def passed(board):
    probe = board.copy()
    probe.push(chess.Move.null())
    return probe


def quiet_line(board, ucis, min_plies=6):
    """Follow a line until the captures stop, so material is never counted mid-trade."""
    b = board.copy()
    out = []
    for u in ucis:
        m = chess.Move.from_uci(u)
        if m not in b.legal_moves or (len(out) >= min_plies and not b.is_capture(m)):
            break
        out.append(u)
        b.push(m)
    return out, b


def first_capture_square(board, ucis, by):
    b = board.copy()
    for u in ucis:
        m = chess.Move.from_uci(u)
        if b.turn == by and b.is_capture(m):
            return chess.square_name(m.to_square)
        b.push(m)
    return None


def sample(rng, weights, floor):
    items = [(m, w) for m, w in weights.items() if w >= floor] or list(weights.items())
    total = sum(w for _, w in items)
    r = rng.random() * total
    for m, w in items:
        r -= w
        if r <= 0:
            return m
    return items[-1][0]
