"""Generate realistic games for one opening and level, with every user turn labelled for the app."""
import argparse, json, random, sys, zlib
from pathlib import Path

import chess

from analyst import Analyst
from chessutil import sample
from label import DEPTH_REST, DEPTH_TOP, LOSS, analyse, scripted_move, turn_record
from openings import OPENINGS, USER_SIDE

LAST_MOVE = 30
STEER_FROM_MOVE, STEER_GAP, STEER_MAX = 12, 6, 2
MISTAKE_SHARE = 0.05


def is_trigger(board, move):
    own_half = range(0, 4) if board.turn == chess.BLACK else range(4, 8)
    return board.is_capture(move) or board.gives_check(move) or chess.square_rank(move.to_square) in own_half


def realistic_mistakes(analyst, board, probs):
    """Opponent moves real players choose at least 5% of the time that throw away 10+ win%."""
    candidates = [chess.Move.from_uci(m) for m, pr in probs.items() if pr >= MISTAKE_SHARE]
    if not candidates:
        return {}
    user_win, _ = analyst.eval(board, DEPTH_REST + 2)
    scored = analyst.lines(board, DEPTH_REST + 2, len(candidates), candidates)
    return {m: probs[m] for m, w, _ in scored if w - user_win >= LOSS}


def opponent_move(analyst, board, rng, best_defence, steer):
    if best_defence:
        return analyst.best_move(board, DEPTH_TOP)
    probs, source = analyst.human(board, analyst.level)
    if steer:
        mistakes = realistic_mistakes(analyst, board, probs)
        if mistakes:
            return sample(rng, mistakes, 0)
    return sample(rng, probs, 0.01 if source.startswith("Lichess") else 0.02)


def generate(analyst, opening, level, game_id, seed):
    rng = random.Random(seed)
    user = chess.WHITE if USER_SIDE[opening] == "w" else chess.BLACK
    board = chess.Board()
    for san in OPENINGS[opening]:
        board.push_san(san)
    prev_win, _ = analyst.eval(board, DEPTH_TOP)
    moves, turns = [], []
    defend_left, steered, last_steer, had_critical = 0, 0, -99, False
    last_move, trigger = None, False
    while not board.is_game_over():
        if board.turn != user:
            steer = (not had_critical and steered < STEER_MAX and board.fullmove_number >= STEER_FROM_MOVE
                     and board.fullmove_number - last_steer >= STEER_GAP)
            uci = opponent_move(analyst, board, rng, defend_left > 0, steer)
            if steer:
                steered, last_steer = steered + 1, board.fullmove_number
            defend_left = max(0, defend_left - 1)
            last_move = chess.Move.from_uci(uci)
            trigger = is_trigger(board, last_move)
            moves.append(board.san(last_move))
            board.push(last_move)
            continue
        if board.fullmove_number > LAST_MOVE:
            break
        a = analyse(analyst, board, prev_win)
        mine = scripted_move(a, lambda w: sample(rng, w, 0.02))
        turn = turn_record(board, a, user, mine, last_move, trigger)
        turn = {"ply": len(moves), "moveNo": board.fullmove_number, **turn}
        turns.append(turn)
        if turn["label"] == "critical":
            defend_left, had_critical = 2, True
        prev_win = a["wins"][mine]
        moves.append(board.san(chess.Move.from_uci(mine)))
        board.push_uci(mine)
    return {"id": game_id, "opening": opening, "level": level, "side": USER_SIDE[opening],
            "start": OPENINGS[opening], "moves": moves, "turns": turns}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--opening", required=True, choices=list(OPENINGS))
    parser.add_argument("--level", type=int, required=True)
    parser.add_argument("--games", type=int, default=20)
    parser.add_argument("--first", type=int, default=1, help="number of the first game")
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "out")
    parser.add_argument("--threads", type=int, default=1)
    args = parser.parse_args()
    user = chess.WHITE if USER_SIDE[args.opening] == "w" else chess.BLACK
    analyst = Analyst(args.opening, args.level, user, args.threads)
    folder = args.out / f"{args.opening}-{args.level}" / "games"
    folder.mkdir(parents=True, exist_ok=True)
    try:
        for n in range(args.first, args.first + args.games):
            game_id = f"{args.opening}-{args.level}-{n:04d}"
            game = generate(analyst, args.opening, args.level, game_id, seed=zlib.crc32(game_id.encode()))
            (folder / f"{game_id}.json").write_text(json.dumps(game, separators=(",", ":")))
            crit = sum(t["label"] == "critical" for t in game["turns"])
            print(f"{game_id}: {len(game['turns'])} turns, {crit} critical", file=sys.stderr, flush=True)
    finally:
        analyst.close()


if __name__ == "__main__":
    main()
