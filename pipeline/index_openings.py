"""Stream a Lichess monthly dump and count, per opening and rating band, which move was played from each position."""
import argparse, json, os, re, struct, sys, threading
from collections import defaultdict, deque
from functools import cache, partial
from multiprocessing import Pool
from pathlib import Path
from queue import Queue

import chess
import zstandard

from openings import OPENINGS, BANDS

MAX_PLY = 24
MIN_GAMES = 30
CHUNK_BYTES = 1 << 23
CACHE_PLY = 8
LONGEST_START = max(len(start) for start in OPENINGS.values())
TOKEN = re.compile(r"\{[^}]*\}|\d+\.(?:\.\.)?|\S+")
RESULTS = {"1-0", "0-1", "1/2-1/2", "*"}
# The leading newline lets the regex engine scan for a literal, which is 8x faster than a multiline ^.
PACED_EVENT = re.compile(rb'\n\[Event "[^"\n]*(?:Rapid|Classical)')
NEXT_GAME = b"\n[Event "
WHITE_ELO = re.compile(r'\n\[WhiteElo "([^"]*)"')
BLACK_ELO = re.compile(r'\n\[BlackElo "([^"]*)"')
POSITION = struct.Struct("<9QBb")


def position_key(board):
    """What an EPD tells apart, packed into bytes; 30x cheaper to build than the EPD itself."""
    en_passant = board.ep_square if board.has_legal_en_passant() else -1
    return POSITION.pack(board.occupied_co[chess.WHITE], board.occupied_co[chess.BLACK], board.pawns, board.knights,
                         board.bishops, board.rooks, board.queens, board.kings, board.castling_rights,
                         board.turn, en_passant)


@cache
def epd_after(line):
    board = chess.Board()
    for san in line.split():
        board.push_san(san)
    return board.epd()


class Position:
    """A board reached early in a game, remembering the position after each SAN move already seen from it."""
    __slots__ = ("board", "key", "after")

    def __init__(self, board):
        self.board = board
        self.key = position_key(board)
        self.after = {}

    def step(self, san):
        """(uci, next position), or None when the move is illegal here."""
        if san not in self.after:
            self.after[san] = self.play(san)
        return self.after[san]

    def play(self, san):
        try:
            move = self.board.parse_san(san)
        except ValueError:
            return None
        board = self.board.copy(stack=False)
        board.push(move)
        return move.uci(), Position(board)


START = Position(chess.Board())  # per process: the shared opening lines are parsed once, not once per game


def san_moves(movetext, limit):
    out = []
    for match in TOKEN.finditer(movetext):
        tok = match.group()
        if tok.startswith("{") or tok[0].isdigit() and tok.endswith("."):
            continue
        if tok in RESULTS or len(out) >= limit:
            break
        out.append(tok.rstrip("?!"))
    return out


def bands_for(white, black):
    return [band for band in BANDS if band[0] <= white < band[1] and band[0] <= black < band[1]]


def key_for(opening, band):
    return f"{opening}-{band[0]}-{band[1]}"


def played(moves):
    """(position key, uci) for each move of a game, up to the first illegal one."""
    node = START
    for san in moves[:CACHE_PLY]:
        step = node.step(san)
        if step is None:
            return
        yield node.key, step[0]
        node = step[1]
    rest = moves[CACHE_PLY:]
    if not rest:
        return
    board = node.board.copy(stack=False)
    for san in rest:
        try:
            move = board.parse_san(san)
        except ValueError:
            return
        yield position_key(board), move.uci()
        board.push(move)


def paced_games(chunk):
    """Raw text of each Rapid or Classical game in the chunk; the rest of the dump never leaves the reader."""
    games = []
    for match in PACED_EVENT.finditer(chunk):
        end = chunk.find(NEXT_GAME, match.end())
        games.append(chunk[match.start(): end if end >= 0 else len(chunk)])
    return games


def read_game(text):
    """(bands, movetext) of a game with both ratings in a band, else None."""
    white, black = WHITE_ELO.search(text), BLACK_ELO.search(text)
    start = text.find("\n1. ")
    if not white or not black or start < 0:
        return None
    try:
        bands = bands_for(int(white[1]), int(black[1]))
    except ValueError:
        return None
    end = text.find("\n", start + 1)
    return bands, text[start + 1: end if end >= 0 else len(text)]


def opening_names(movetext):
    head = san_moves(movetext, LONGEST_START)
    return [name for name, start in OPENINGS.items() if head[: len(start)] == start]


def count_games(raw_games, room):
    """Count games, taking at most room[key] for each opening-band key; lines maps a position to a SAN line reaching it."""
    games = defaultdict(int)
    positions = defaultdict(lambda: defaultdict(int))
    lines = {}
    for raw in raw_games:
        game = read_game(raw.decode("utf-8", "ignore"))
        if not game or not game[0]:
            continue
        bands, movetext = game
        names = opening_names(movetext)
        moves = san_moves(movetext, MAX_PLY) if names else []
        for name in names:
            for band in bands:
                key = key_for(name, band)
                if games[key] < room.get(key, 0):
                    games[key] += 1
                    for ply, (position, uci) in enumerate(played(moves)):
                        positions[key][position, uci] += 1
                        if position not in lines:
                            lines[position] = " ".join(moves[:ply])
    return dict(games), {key: dict(pairs) for key, pairs in positions.items()}, lines


def add_games(raw_games, found, cap, games, positions, lines):
    """Merge one batch's result without letting any key go past cap games."""
    for key, n in found[0].items():
        room = cap - games[key]
        if room <= 0:
            continue
        part = found if n <= room else count_games(raw_games, {key: room})
        games[key] += part[0][key]
        merged = positions[key]
        for pair, count in part[1][key].items():
            merged[pair] += count
            lines.setdefault(pair[0], part[2][pair[0]])


def results(chunks, cap, workers):
    """Yield (raw games, count_games result) in stream order, counting on several processes when asked."""
    room = {key_for(name, band): cap for name in OPENINGS for band in BANDS}
    pending = deque()

    def batches():
        for chunk in chunks:
            pending.append(paced_games(chunk))
            yield pending[-1]

    count = partial(count_games, room=room)
    if workers <= 0:
        for found in map(count, batches()):
            yield pending.popleft(), found
        return
    with Pool(workers) as pool:
        for found in pool.imap(count, batches()):
            yield pending.popleft(), found


def build(chunks, cap, workers=0):
    """Return ({key: {(position, uci): games}}, {key: games}, {position: line}); workers=0 counts in this process."""
    games = defaultdict(int)
    positions = defaultdict(lambda: defaultdict(int))
    lines = {}
    for raw_games, found in results(chunks, cap, workers):
        add_games(raw_games, found, cap, games, positions, lines)
    return positions, games, lines


def read_chunks(stream, size=CHUNK_BYTES):
    """Cut a decompressed dump into blocks of whole games, each starting at the newline before an Event line."""
    rest = b"\n"
    try:
        while data := stream.read(size):
            rest += data
            cut = rest.rfind(NEXT_GAME)
            if cut > 0:
                yield rest[:cut]
                rest = rest[cut:]
    except zstandard.ZstdError:
        pass  # a truncated download still gives a usable prefix
    yield rest


def in_background(items, depth=4):
    """Iterate on another thread; decompressing releases the GIL, so it overlaps with whoever consumes the items."""
    queue = Queue(depth)

    def pump():
        try:
            for item in items:
                queue.put((item, None))
            queue.put((None, None))
        except BaseException as error:
            queue.put((None, error))

    threading.Thread(target=pump, daemon=True).start()
    while True:
        item, error = queue.get()
        if error:
            raise error
        if item is None:
            return
        yield item


def common_positions(pairs, lines):
    """{epd: {uci: games}} for the positions that reached MIN_GAMES; the costly EPD is only built for those."""
    totals = defaultdict(int)
    for (position, _), n in pairs.items():
        totals[position] += n
    kept = {}
    for (position, uci), n in pairs.items():
        if totals[position] >= MIN_GAMES:
            kept.setdefault(epd_after(lines[position]), {})[uci] = n
    return kept


def write_index(out, positions, games, lines):
    out.mkdir(parents=True, exist_ok=True)
    for key, pairs in positions.items():
        kept = common_positions(pairs, lines)
        (out / f"{key}.json").write_text(json.dumps(kept, separators=(",", ":")))
        print(f"{key}: {games[key]} games, {len(kept)} positions", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("out", type=Path)
    parser.add_argument("--cap", type=int, default=40000, help="max games per opening and band")
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1),
                        help="counting processes; the main process only decompresses (0 counts in-process)")
    args = parser.parse_args()
    stream = zstandard.ZstdDecompressor().stream_reader(sys.stdin.buffer, read_size=CHUNK_BYTES // 2)
    write_index(args.out, *build(in_background(read_chunks(stream)), args.cap, args.workers))


if __name__ == "__main__":
    main()
