import json
import os
import shutil
from pathlib import Path

import chess
import chess.engine
from maia2 import inference, model
from maia2.model import MAIA2Model
from maia2.train import load_model_state_dict
from maia2.utils import create_elo_dict, get_all_possible_moves, parse_args

from chessutil import to_win
from openings import STRONGER, band

MIN_GAMES = 30
DATA = Path(__file__).parent / "data"


def stockfish_path():
    return os.environ.get("STOCKFISH") or shutil.which("stockfish") or "/usr/games/stockfish"


def load_maia():
    """Official weights, or the identical Hugging Face safetensors copy when present (CI can't rely on Google Drive)."""
    folder = Path(os.environ.get("MAIA_DIR", DATA / "maia"))
    weights = folder / "maia2-rapid.safetensors"
    if not weights.exists():
        return model.from_pretrained(type="rapid", device="cpu", save_root=str(folder))
    from importlib.resources import as_file, files

    from safetensors.torch import load_file

    with as_file(files("maia2.configs").joinpath("maia2-training.yaml")) as cfg_path:
        cfg = parse_args(cfg_path)
    net = MAIA2Model(len(get_all_possible_moves()), create_elo_dict(), cfg)
    load_model_state_dict(net, load_file(weights))
    return net


def load_index(opening, rating):
    lo, hi = band(rating)
    path = Path(os.environ.get("INDEX_DIR", DATA / "index")) / f"{opening}-{lo}-{hi}.json"
    return json.loads(path.read_text()) if path.exists() else {}


class Analyst:
    """Stockfish for judging, real game frequencies and Maia-2 for what humans at a rating play."""

    def __init__(self, opening, level, user, threads=1):
        self.level = level
        self.user = user
        self.engine = chess.engine.SimpleEngine.popen_uci(stockfish_path())
        self.engine.configure({"Threads": threads, "Hash": 64})
        self.maia = load_maia()
        self.prepared = inference.prepare()
        self.indexes = {r: load_index(opening, r) for r in (level, level + STRONGER)}

    def close(self):
        self.engine.quit()

    def human(self, board, rating):
        counts = self.indexes[rating].get(board.epd())
        if counts and sum(counts.values()) >= MIN_GAMES:
            total = sum(counts.values())
            lo, hi = band(rating)
            return {m: c / total for m, c in counts.items()}, f"Lichess {lo}-{hi} ({total} games)"
        probs, _ = inference.inference_each(self.maia, self.prepared, board.fen(), rating, self.level)
        return probs, f"Maia-2 @{rating}"

    def lines(self, board, depth, multipv, root_moves=None):
        infos = self.engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multipv, root_moves=root_moves)
        return [(i["pv"][0].uci(), to_win(i["score"], self.user), [m.uci() for m in i["pv"]]) for i in infos if "pv" in i]

    def eval(self, board, depth):
        info = self.engine.analyse(board, chess.engine.Limit(depth=depth))
        return to_win(info["score"], self.user), [m.uci() for m in info.get("pv", [])]

    def best_move(self, board, depth):
        return self.engine.play(board, chess.engine.Limit(depth=depth)).move.uci()
