"""Assemble generated games into the app's content folder and write a short report."""
import argparse, json, shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def load_games(folder):
    return [json.loads(p.read_text()) for p in sorted(folder.glob("games/*.json"))]


def has_critical(game):
    return any(t["label"] == "critical" for t in game["turns"])


def write_games(games, folder):
    folder.mkdir(parents=True)
    for game in games:
        (folder / f"{game['id']}.json").write_text(json.dumps(game, separators=(",", ":")))


def set_report(name, games):
    turns = [t for g in games for t in g["turns"]]
    labels = Counter(t["label"] for t in turns)
    kinds = Counter(k for t in turns for k in t["kinds"])
    n = len(games) or 1
    return (f"| {name} | {len(games)} | {labels['critical'] / n:.1f} | {labels['nothing'] / n:.1f} | "
            f"{labels['gray'] / n:.1f} | {kinds['win']} / {kinds['defend']} / {kinds['trap']} |")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="generator output folder")
    parser.add_argument("target", type=Path, help="content folder served by the app")
    args = parser.parse_args()
    args.target.mkdir(parents=True, exist_ok=True)
    sets, rows = [], []
    for folder in sorted(p for p in args.source.iterdir() if (p / "games").is_dir()):
        # A game with no critical moment would only ever ask "is something happening?" on quiet positions.
        games = [g for g in load_games(folder) if has_critical(g)]
        if not games:
            continue
        first = games[0]
        out = args.target / folder.name
        if out.exists():
            shutil.rmtree(out)
        write_games(games, out / "games")
        index = {"opening": first["opening"], "level": first["level"], "side": first["side"], "start": first["start"],
                 "games": [{"id": g["id"], "moves": g["moves"]} for g in games]}
        (out / "index.json").write_text(json.dumps(index, separators=(",", ":")))
        sets.append(folder.name)
        rows.append(set_report(folder.name, games))
    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    (args.target / "manifest.json").write_text(json.dumps({"version": version, "sets": sets}))
    report = ["| Set | Games | Critical / game | Nothing / game | In between / game | Win / defend / trap |",
              "|---|---|---|---|---|---|", *rows]
    (args.target.parent / "report.md").write_text("\n".join(report) + "\n")
    print("\n".join(report))


if __name__ == "__main__":
    main()
