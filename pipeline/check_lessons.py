"""Re-grade the opening lessons' positions with Stockfish: the move each one asks must still hold at depth 20.

Usage: python pipeline/check_lessons.py <content dir> [--drills]

Reads each set's course.json and checks every opening lesson's worked examples, and with --drills its practice
positions too. A move that loses more than 2.5 win% against the best gets a warning, more than 3.5 fails.
The failures are printed as boards without move counters, ready for EXCLUDE in src/course/openings/mine.ts:
a board can come up in many games.
"""
import argparse
import json
import sys
from multiprocessing import Pool
from pathlib import Path

import chess
import chess.engine

from chessutil import stockfish_path, to_win

DEPTH = 20
HOLD = 2.5
SLACK = 1.0
OPENINGS = ("italian-", "caro-kann-")


def position_key(ref):
    return f"{ref['set']}/{ref['gameId']}:{ref['ply']}"


def lesson_refs(content, with_drills):
    """Each opening lesson position once, by key, with the lesson that asks it."""
    refs = {}
    for course_path in sorted(Path(content).glob("*/course.json")):
        course = json.loads(course_path.read_text())
        for unit in course["units"]:
            if not unit["id"].startswith(OPENINGS):
                continue
            for ref in unit["examples"] + (unit["drills"] if with_drills else []):
                refs.setdefault(position_key(ref), (ref, unit["id"]))
    return list(refs.values())


def asked_move(content, ref):
    """The position before the move a lesson asks for, and that move: the game's own move at the turn."""
    game = json.loads((Path(content) / ref["set"] / "games" / f"{ref['gameId']}.json").read_text())
    turn = next(t for t in game["turns"] if t["ply"] == ref["ply"])
    board = chess.Board(turn["fen"])
    return board, board.parse_san(game["moves"][ref["ply"]])


def loss_of(engine, board, move):
    """Win% the move loses against the engine's best, for the side to move."""
    limit = chess.engine.Limit(depth=DEPTH)
    best = engine.analyse(board, limit)
    best_win = to_win(best["score"], board.turn)
    if best["pv"][0] == move:
        return 0.0
    played = engine.analyse(board, limit, root_moves=[move])
    return max(0.0, best_win - to_win(played["score"], board.turn))


def check(job):
    content, ref, lesson = job
    board, move = asked_move(content, ref)
    with chess.engine.SimpleEngine.popen_uci(stockfish_path()) as engine:
        engine.configure({"Hash": 64})
        loss = loss_of(engine, board, move)
    return position_key(ref), lesson, board.san(move), loss, " ".join(board.fen().split()[:4])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("content")
    parser.add_argument("--drills", action="store_true", help="check the practice positions too")
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()

    jobs = [(args.content, ref, lesson) for ref, lesson in lesson_refs(args.content, args.drills)]
    with Pool(args.jobs) as pool:
        results = sorted(pool.imap_unordered(check, jobs))
    warned = [r for r in results if HOLD < r[3] <= HOLD + SLACK]
    failed = [r for r in results if r[3] > HOLD + SLACK]
    for key, lesson, san, loss, _ in warned + failed:
        verdict = "FAIL" if loss > HOLD + SLACK else "warn"
        print(f"{verdict} {key} {lesson} {san} loses {loss:.1f}")
    print(f"Checked {len(results)} positions at depth {DEPTH}: {len(warned)} warnings, {len(failed)} failures.")
    if failed:
        boards = dict.fromkeys(r[4] for r in failed)
        print("For EXCLUDE:\n" + "\n".join(f"  '{board}'," for board in boards))
        sys.exit(1)


if __name__ == "__main__":
    main()
