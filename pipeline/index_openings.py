"""Stream a Lichess monthly dump and count, per opening and rating band, which move was played from each position."""
import argparse, io, json, re, sys
from collections import defaultdict
from pathlib import Path

import chess
import zstandard

from openings import OPENINGS, BANDS

MAX_PLY = 24
MIN_GAMES = 30
TOKEN = re.compile(r"\{[^}]*\}|\d+\.(?:\.\.)?|\S+")
RESULTS = {"1-0", "0-1", "1/2-1/2", "*"}


def san_moves(movetext, limit):
    out = []
    for tok in TOKEN.findall(movetext):
        if tok.startswith("{") or tok[0].isdigit() and tok.endswith("."):
            continue
        if tok in RESULTS or len(out) >= limit:
            break
        out.append(tok.rstrip("?!"))
    return out


def bands_for(white, black):
    return [band for band in BANDS if band[0] <= white < band[1] and band[0] <= black < band[1]]


def count_game(index, key, moves):
    board = chess.Board()
    for san in moves:
        try:
            move = board.parse_san(san)
        except ValueError:
            return
        index[key][board.epd()][move.uci()] += 1
        board.push(move)


def lines(stream):
    try:
        yield from stream
    except zstandard.ZstdError:
        return  # a truncated download still gives a usable prefix


def games(stream):
    headers = {}
    for line in lines(stream):
        if line.startswith("[Event "):
            headers = {"Event": line}
        elif line.startswith("[WhiteElo ") or line.startswith("[BlackElo "):
            headers[line[1:9]] = line.split('"')[1]
        elif line.startswith("1. "):
            yield headers, line


def build(stream, cap):
    index = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    counts = defaultdict(int)
    for headers, movetext in games(stream):
        event = headers.get("Event", "")
        if "Rapid" not in event and "Classical" not in event:
            continue
        try:
            bands = bands_for(int(headers["WhiteElo"]), int(headers["BlackElo"]))
        except (KeyError, ValueError):
            continue
        if not bands:
            continue
        moves = san_moves(movetext, MAX_PLY)
        for opening, start in OPENINGS.items():
            if moves[: len(start)] != start:
                continue
            for band in bands:
                key = f"{opening}-{band[0]}-{band[1]}"
                if counts[key] < cap:
                    counts[key] += 1
                    count_game(index, key, moves)
    return index, counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("out", type=Path)
    parser.add_argument("--cap", type=int, default=40000, help="max games per opening and band")
    args = parser.parse_args()
    stream = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(sys.stdin.buffer), errors="ignore")
    index, counts = build(stream, args.cap)
    args.out.mkdir(parents=True, exist_ok=True)
    for key, positions in index.items():
        kept = {epd: dict(moves) for epd, moves in positions.items() if sum(moves.values()) >= MIN_GAMES}
        (args.out / f"{key}.json").write_text(json.dumps(kept, separators=(",", ":")))
        print(f"{key}: {counts[key]} games, {len(kept)} positions", file=sys.stderr)


if __name__ == "__main__":
    main()
