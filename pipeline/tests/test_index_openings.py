import io
import json
import subprocess
import sys
from pathlib import Path

import chess
import pytest
import zstandard

import index_openings
from index_openings import (MAX_PLY, bands_for, build, common_positions, epd_after, paced_games, position_key, read_chunks,
                            read_game, san_moves, write_index)

PIPELINE = Path(__file__).parent.parent
ITALIAN = "e4 e5 Nf3 Nc6 Bc4"
CARO_KANN = "e4 c6 d4 d5"
CLOCK = "{ [%clk 0:10:00] }"
ITALIAN_KEY = "italian-1500-1700"


def movetext(sans):
    parts = [f"{ply // 2 + 1}{'.' if ply % 2 == 0 else '...'} {san} {CLOCK}" for ply, san in enumerate(sans.split())]
    return " ".join(parts) + " 1-0"


def game(sans, event="Rated Rapid game", white=1500, black=1500):
    headers = f'[Event "{event}"]\n[Site "https://lichess.org/abcd1234"]\n[Result "1-0"]\n[WhiteElo "{white}"]\n[BlackElo "{black}"]\n'
    return f"{headers}[TimeControl \"600+0\"]\n\n{movetext(sans)}\n\n"


def dump(*games):
    return "".join(games).encode()


def chunk(*games):
    """What read_chunks hands over: whole games, led by the newline before the first Event line."""
    return b"\n" + dump(*games)


def epd_counts(positions, lines, key=ITALIAN_KEY):
    return common_positions(positions[key], lines)


@pytest.fixture
def every_position(monkeypatch):
    monkeypatch.setattr(index_openings, "MIN_GAMES", 1)


def test_san_moves_skips_numbers_comments_and_annotations():
    text = "1. e4 { [%clk 0:10:00] } 1... e5?! 2. Nf3 { [%eval 0.3] } 2... Nc6! 1-0"
    assert san_moves(text, MAX_PLY) == ["e4", "e5", "Nf3", "Nc6"]


def test_san_moves_stops_at_the_limit_and_at_the_result():
    assert san_moves("1. e4 e5 2. Nf3 Nc6", 3) == ["e4", "e5", "Nf3"]
    assert san_moves("1. e4 e5 1/2-1/2 2. Nf3", MAX_PLY) == ["e4", "e5"]


@pytest.mark.parametrize("white, black, expected", [
    (1500, 1500, [(1500, 1700)]),
    (1650, 1650, [(1500, 1700), (1600, 1800)]),
    (1500, 1900, []),
    (1190, 1210, []),
    (1100, 1150, [(1000, 1200)]),
    (2500, 2500, []),
])
def test_bands_need_both_players_inside(white, black, expected):
    assert bands_for(white, black) == expected


def test_read_game_returns_bands_and_the_movetext_line():
    bands, text = read_game("\n" + game(ITALIAN))
    assert bands == [(1500, 1700)]
    assert text == movetext(ITALIAN)


@pytest.mark.parametrize("white, black", [("?", 1500), (1500, "?"), ("", 1500)])
def test_read_game_rejects_unrated_players(white, black):
    assert read_game("\n" + game(ITALIAN, white=white, black=black)) is None


def test_read_game_rejects_a_game_without_moves():
    text = game(ITALIAN).split("\n\n")[0] + "\n\n0-1\n\n"
    assert read_game("\n" + text) is None


def test_read_game_keeps_players_without_a_shared_band_as_empty():
    assert read_game("\n" + game(ITALIAN, white=1500, black=1900))[0] == []


def test_read_chunks_cut_between_games():
    games = [game(ITALIAN), game(CARO_KANN), game("d4 d5")]
    data = dump(*games)
    chunks = list(read_chunks(io.BytesIO(data), size=300))
    assert len(chunks) > 1
    assert b"".join(chunks) == b"\n" + data
    assert all(chunk.startswith(b"\n[Event ") for chunk in chunks)


def test_paced_games_keep_only_rapid_and_classical():
    events = ["Rated Bullet game", "Rated Rapid game", "Rated Blitz tournament https://lichess.org/tournament/abc",
              "Rated Classical game", "Rated Rapid tournament https://lichess.org/tournament/def", "Rated Correspondence game"]
    found = paced_games(chunk(*[game(ITALIAN, event=event) for event in events]))
    kept = [text.split(b"\n")[1].decode() for text in found]
    assert kept == [f'[Event "{events[i]}"]' for i in (1, 3, 4)]


def test_paced_games_do_not_run_into_the_next_game():
    found = paced_games(chunk(game(ITALIAN), game(CARO_KANN, event="Rated Blitz game"), game("d4 d5")))
    assert len(found) == 2
    assert all(b"Blitz" not in text for text in found)


def test_position_key_matches_the_epd_across_transpositions():
    lines = ["e4 e5 Nf3 Nc6", "Nf3 Nc6 e4 e5", "e4 e5 Nf3 Nf6 Ng1 Ng8", "e4 d5 e5 f5", "e4 e5 Ke2 Ke7 Ke1 Ke8"]
    boards = []
    for line in lines:
        board = chess.Board()
        for san in line.split():
            board.push_san(san)
            boards.append(board.copy())
    for a in boards:
        for b in boards:
            assert (position_key(a) == position_key(b)) == (a.epd() == b.epd())


def test_position_key_counts_an_en_passant_square_only_when_it_can_be_used():
    usable = chess.Board()
    for san in "e4 d5 e5 f5".split():
        usable.push_san(san)
    unusable = usable.copy()
    unusable.ep_square = None
    assert position_key(usable) != position_key(unusable)
    first = chess.Board()
    first.push_san("e4")
    assert position_key(first) == position_key(chess.Board(first.board_fen() + " b KQkq - 0 1"))


def test_epd_after_replays_a_san_line():
    board = chess.Board()
    for san in ITALIAN.split():
        board.push_san(san)
    assert epd_after(ITALIAN) == board.epd()
    assert epd_after("") == chess.Board().epd()


def test_build_counts_only_games_that_pass_the_header_filter(every_position):
    stream = chunk(
        game(ITALIAN + " Bc5 c3"),
        game(ITALIAN + " Nf6 d3", event="Rated Classical game"),
        game(ITALIAN + " Bc5", event="Rated Blitz game"),
        game(ITALIAN + " Bc5", white=1500, black=1900),
        game(ITALIAN + " Bc5", white="?", black="?"),
        game("d4 d5 c4"),
        game(CARO_KANN, black=1500, white=1500),
        game(ITALIAN, event="Rated Bullet game"),
    )
    positions, games, lines = build([stream], cap=100)
    assert dict(games) == {ITALIAN_KEY: 2, "caro-kann-1500-1700": 1}
    counts = epd_counts(positions, lines)
    assert counts[chess.Board().epd()] == {"e2e4": 2}
    assert counts[epd_after(ITALIAN)] == {"f8c5": 1, "g8f6": 1}
    assert epd_after(ITALIAN + " Bc5") in counts and epd_after(ITALIAN + " Nf6") in counts
    assert counts[epd_after("e4")] == {"e7e5": 2}


def test_build_counts_both_bands_of_a_player_pair_in_the_overlap(every_position):
    _, games, _ = build([chunk(game(CARO_KANN, white=1650, black=1650))], cap=100)
    assert dict(games) == {"caro-kann-1500-1700": 1, "caro-kann-1600-1800": 1}


def test_build_follows_only_the_first_max_ply_moves(every_position):
    shuffle = "Ng1 Ng8 Nf3 Nf6"
    long_line = f"{ITALIAN} Nf6 " + " ".join([shuffle] * 6)
    assert len(long_line.split()) > MAX_PLY + 4
    positions, _, _ = build([chunk(game(long_line))], cap=100)
    assert sum(positions[ITALIAN_KEY].values()) == MAX_PLY


def test_build_stops_a_game_at_its_first_illegal_move(every_position):
    positions, games, _ = build([chunk(game(ITALIAN + " Bc5 Rh5"))], cap=100)
    assert dict(games) == {ITALIAN_KEY: 1}
    assert sum(positions[ITALIAN_KEY].values()) == 6


@pytest.mark.parametrize("workers", [0, 2])
def test_build_caps_games_per_key_in_stream_order(every_position, workers):
    first = chunk(game(ITALIAN + " Bc5"))
    second = chunk(game(ITALIAN + " Nf6"), game(ITALIAN + " d6"), game(ITALIAN + " Be7"))
    positions, games, lines = build([first, second], cap=2, workers=workers)
    assert games[ITALIAN_KEY] == 2
    assert epd_counts(positions, lines)[epd_after(ITALIAN)] == {"f8c5": 1, "g8f6": 1}


def counted(result):
    positions, games, lines = result
    return dict(games), {key: common_positions(pairs, lines) for key, pairs in positions.items()}


def test_workers_give_the_same_counts_as_one_process(every_position):
    played = [ITALIAN + " Bc5 c3 Nf6", ITALIAN + " Nf6 d3 Be7", CARO_KANN + " Nc3 dxe4", ITALIAN + " Bc5 b4 Bxb4"]
    ratings = [1500, 1650, 1650, 1500]
    chunks = [chunk(*[game(line, white=r, black=r) for line, r in zip(played, ratings)]) for _ in range(5)]
    assert counted(build(chunks, cap=100, workers=2)) == counted(build(chunks, cap=100, workers=0))


def test_write_index_keeps_positions_with_enough_games(tmp_path):
    common = ITALIAN + " Bc5"
    rare = ITALIAN + " Nf6 Ng5"
    stream = chunk(*[game(common)] * 30, *[game(rare)] * 5)
    write_index(tmp_path, *build([stream], cap=100))
    written = json.loads((tmp_path / f"{ITALIAN_KEY}.json").read_text())
    board = chess.Board()
    expected = {}
    for san in ITALIAN.split():
        expected[board.epd()] = {board.parse_san(san).uci(): 35}
        board.push_san(san)
    expected[board.epd()] = {"f8c5": 30, "g8f6": 5}
    assert written == expected


def test_write_index_writes_one_file_per_opening_and_band(tmp_path):
    write_index(tmp_path, *build([chunk(game(ITALIAN, white=1650, black=1650), game(CARO_KANN))], cap=100))
    assert sorted(p.name for p in tmp_path.iterdir()) == [
        "caro-kann-1500-1700.json", "italian-1500-1700.json", "italian-1600-1800.json"]


def compressed_in_blocks(games):
    compressor = zstandard.ZstdCompressor().compressobj()
    return [compressor.compress(g) + compressor.flush(zstandard.COMPRESSOBJ_FLUSH_BLOCK) for g in games]


class FailingStream:
    """Hands over its data, then fails the way a cut-off zstd stream can."""

    def __init__(self, data):
        self.data = io.BytesIO(data)

    def read(self, size):
        if data := self.data.read(size):
            return data
        raise zstandard.ZstdError("truncated")


def test_read_chunks_keeps_the_games_before_a_decompression_error():
    data = dump(game(ITALIAN), game(CARO_KANN))
    assert b"".join(read_chunks(FailingStream(data), size=64)) == b"\n" + data


def test_read_chunks_keeps_the_games_before_a_cut_in_the_compressed_stream():
    parts = compressed_in_blocks([dump(game(ITALIAN)), dump(game(CARO_KANN)), dump(game("d4 d5"))])
    stream = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(b"".join(parts[:2]) + parts[2][:3]))
    assert b"".join(read_chunks(stream, size=64)).count(b"[Event ") == 2


def test_command_line_reads_a_compressed_dump_from_stdin(tmp_path):
    data = zstandard.ZstdCompressor().compress(dump(*[game(ITALIAN + " Bc5")] * 30, game(CARO_KANN)))
    run = subprocess.run([sys.executable, "index_openings.py", str(tmp_path), "--workers", "0"], cwd=PIPELINE, input=data,
                         capture_output=True, check=True)
    assert f"{ITALIAN_KEY}: 30 games" in run.stderr.decode()
    assert len(json.loads((tmp_path / f"{ITALIAN_KEY}.json").read_text())) == 6
    assert json.loads((tmp_path / "caro-kann-1500-1700.json").read_text()) == {}
