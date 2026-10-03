"""Score one of the user's turns and label it critical, nothing or in between."""
import chess

from chessutil import bucket, first_capture_square, material, passed, quiet_line
from openings import STRONGER

DEPTH_TOP, DEPTH_HUMAN, DEPTH_REST, DEPTH_THREAT = 14, 12, 8, 12
LOSS, HOLD = 10, 2.5
CRITICAL_WRONG, FINDABLE, NOTHING_WRONG = 0.15, 0.10, 0.05


def grade_moves(analyst, board):
    """Win% of every legal move: deep for the top lines, shallower for the rest."""
    results = analyst.lines(board, DEPTH_TOP, min(5, board.legal_moves.count()))
    best = max(w for _, w, _ in results)
    wins = {m: w for m, w, _ in results}
    pvs = {m: pv for m, _, pv in results}
    p, source = analyst.human(board, analyst.level)
    p200, source200 = analyst.human(board, analyst.level + STRONGER)
    likely = [m for m, pr in p.items() if pr >= 0.005] + [m for m, pr in p200.items() if pr >= 0.02]
    for depth, moves in ((DEPTH_HUMAN, likely), (DEPTH_REST, [m.uci() for m in board.legal_moves])):
        rest = [chess.Move.from_uci(m) for m in dict.fromkeys(moves) if m not in wins]
        if rest:
            for m, w, pv in analyst.lines(board, depth, len(rest), rest):
                wins[m], pvs[m] = min(w, best), pv
    return best, wins, pvs, (p, source), (p200, source200)


def analyse(analyst, board, prev_win):
    best, wins, pvs, (p, source), (p200, source200) = grade_moves(analyst, board)
    loss = {m: best - w for m, w in wins.items()}
    # a slip only counts as wrong if it also drops the verdict, e.g. winning -> only clearly better
    wrong = sum(pr for m, pr in p.items() if loss.get(m, 0) >= LOSS and bucket(best - loss[m]) > bucket(best))
    holding = [m for m in wins if loss[m] <= HOLD]
    find = sum(p200.get(m, 0) for m in holding)
    if source.startswith("Lichess") and not source200.startswith("Lichess"):
        find = max(find, sum(p.get(m, 0) for m in holding))
    gift = best - prev_win
    a = dict(best=best, wins=wins, pvs=pvs, loss=loss, p=p, p200=p200, source=source, wrong=wrong,
             find=find, holding=holding, gift=gift, threat=0.0, threat_pv=[])
    candidate = wrong >= CRITICAL_WRONG and find >= FINDABLE
    quiet = wrong < NOTHING_WRONG and gift < 5
    if (candidate or quiet) and not board.is_check():
        null_win, a["threat_pv"] = analyst.eval(passed(board), DEPTH_THREAT)
        a["threat"] = best - null_win
    a["label"] = "critical" if candidate else ("nothing" if quiet and a["threat"] < 5 and not board.is_check() else "gray")
    return a


def scripted_move(a, rng_sample):
    if a["label"] == "critical":
        return max(a["holding"], key=lambda m: (a["p200"].get(m, 0), a["wins"][m]))
    weights = {m: pr for m, pr in a["p"].items() if a["loss"].get(m, 100) < 5}
    return rng_sample(weights) if weights else max(a["wins"], key=a["wins"].get)


def most_common_mistake(a):
    wrong = [(pr, m) for m, pr in a["p"].items() if a["loss"].get(m, 0) >= LOSS and m in a["pvs"]]
    return max(wrong)[1] if wrong else None


def kinds_and_keys(board, a, user, scripted, last_move):
    now = material(board, user)
    best_line, best_end = quiet_line(board, a["pvs"][scripted])
    mistake = most_common_mistake(a)
    if not mistake:
        return None
    mistake_line, mistake_end = quiet_line(board, a["pvs"][mistake])
    gain = material(best_end, user) - material(mistake_end, user)
    mate = best_end.is_checkmate() or mistake_end.is_checkmate()
    if gain < 2 and not mate:
        return None  # the reveal could not show why it matters
    threat_line, threat_end = quiet_line(passed(board), a["threat_pv"], 2) if a["threat_pv"] else ([], board)
    best_move = chess.Move.from_uci(scripted)
    recapture = last_move is not None and board.is_capture(best_move) and best_move.to_square == last_move.to_square
    kinds, keys = [], set()
    if material(best_end, user) - now >= 1 or (best_end.is_checkmate() and best_end.turn != user):
        kinds.append("win")
        keys |= {scripted[:2], first_capture_square(board, best_line, user)}
    threat_mated = threat_end.is_checkmate() and threat_end.turn == user
    if threat_line and (now - material(threat_end, user) >= 2 or threat_mated) and not recapture:
        kinds.append("defend")
        keys |= {threat_line[0][:2], first_capture_square(passed(board), threat_line, not user)}
    if not kinds:
        kinds.append("trap")
        keys |= {mistake[:2], mistake[2:4]}
    keys.discard(None)
    lines = {"best": best_line, "mistake": mistake_line}
    if threat_line:
        lines["threat"] = threat_line
    return kinds, sorted(keys), lines, mistake


def refutation(board, pv):
    """The answer to a bad move, followed until the captures stop so any material it costs shows in the line."""
    line, _ = quiet_line(board, pv)
    return line[1:]


def turn_record(board, a, user, scripted, last_move, trigger):
    record = {
        "fen": board.fen(),
        "label": a["label"],
        "kinds": [],
        "wrongShare": round(a["wrong"], 3),
        "findShare": round(a["find"], 3),
        "source": a["source"],
        "human": [{"uci": m, "share": round(pr, 3)} for m, pr in sorted(a["p"].items(), key=lambda kv: -kv[1]) if pr >= 0.02][:6],
        "grades": {m: round(l, 1) for m, l in a["loss"].items()},
        "refutations": {m: refutation(board, a["pvs"][m]) for m, l in a["loss"].items() if l >= LOSS and len(a["pvs"].get(m, [])) > 1},
        "bestWin": round(a["best"], 1),
        "material": material(board, user),
        "lines": {},
        "mistakeMove": None,
        "keySquares": [],
        "trigger": trigger,
        "inCheck": board.is_check(),
    }
    if a["label"] == "critical":
        found = kinds_and_keys(board, a, user, scripted, last_move)
        if found:
            record["kinds"], record["keySquares"], record["lines"], record["mistakeMove"] = found
        else:
            record["label"] = "gray"
    return record
