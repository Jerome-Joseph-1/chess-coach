import json

import export


def game(id, labels):
    return {"id": id, "opening": "italian", "level": 1400, "side": "w", "start": ["e4"], "moves": ["e5"],
            "turns": [{"label": label, "kinds": []} for label in labels]}


def test_export_keeps_only_games_with_a_critical_moment(tmp_path, monkeypatch):
    source = tmp_path / "out" / "italian-1400" / "games"
    source.mkdir(parents=True)
    for g in [game("italian-1400-0001", ["gray", "critical"]), game("italian-1400-0002", ["gray", "nothing"])]:
        (source / f"{g['id']}.json").write_text(json.dumps(g))
    target = tmp_path / "site" / "content"
    monkeypatch.setattr("sys.argv", ["export.py", str(tmp_path / "out"), str(target)])

    export.main()

    index = json.loads((target / "italian-1400" / "index.json").read_text())
    assert [g["id"] for g in index["games"]] == ["italian-1400-0001"]
    assert sorted(p.name for p in (target / "italian-1400" / "games").iterdir()) == ["italian-1400-0001.json"]
