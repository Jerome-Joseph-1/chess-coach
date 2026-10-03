OPENINGS = {
    "italian": ["e4", "e5", "Nf3", "Nc6", "Bc4"],
    "caro-kann": ["e4", "c6"],
}
USER_SIDE = {"italian": "w", "caro-kann": "b"}
LEVELS = [1100, 1400, 1700, 2000]
STRONGER = 200


def band(rating):
    return (rating - 100, rating + 100)


BANDS = sorted({band(level) for level in LEVELS} | {band(level + STRONGER) for level in LEVELS})
