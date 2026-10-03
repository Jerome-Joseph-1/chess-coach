import chess

LEVEL_SOURCE = "Lichess 1300-1500 (120 games)"
STRONGER_SOURCE = "Lichess 1500-1700 (90 games)"


def uci_line(san_moves, fen=chess.STARTING_FEN):
    """UCI moves for a space-separated SAN line played from a FEN."""
    board = chess.Board(fen)
    return [board.push_san(san).uci() for san in san_moves.split()]


def fen_after(san_moves, fen=chess.STARTING_FEN):
    board = chess.Board(fen)
    for san in san_moves.split():
        board.push_san(san)
    return board.fen()


class CannedHumans:
    """What players at the level and at the stronger level choose, as fixed shares."""
    level = 1400

    def __init__(self, human, stronger, sources=(LEVEL_SOURCE, STRONGER_SOURCE)):
        self.shares = {self.level: human, self.level + 200: stronger}
        self.sources = dict(zip(self.shares, sources))

    def human(self, board, rating):
        return self.shares[rating], self.sources[rating]


class FakeAnalyst(CannedHumans):
    """Canned grades in place of Stockfish and Maia, so labelling runs on fixed numbers."""

    def __init__(self, wins, human, stronger, pvs=None, null_win=None, threat_pv=(), sources=(LEVEL_SOURCE, STRONGER_SOURCE)):
        super().__init__(human, stronger, sources)
        self.wins = wins
        self.pvs = pvs or {}
        self.null_win = max(wins.values()) - 1 if null_win is None else null_win
        self.threat_pv = list(threat_pv)

    def lines(self, board, depth, multipv, root_moves=None):
        allowed = {m.uci() for m in root_moves} if root_moves else None
        graded = sorted(((m, w) for m, w in self.wins.items() if allowed is None or m in allowed), key=lambda mw: -mw[1])
        return [(m, w, self.pvs.get(m, [m])) for m, w in graded[:multipv]]

    def eval(self, board, depth):
        return self.null_win, self.threat_pv
