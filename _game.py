
from copy import deepcopy

ROWS = ["1", "2", "3", "4", "5", "6", "Total haut", "Bonus",
        "Full", "Carre", "Suite", "Plus", "Moins", "Yam's", "Total bas"]
COLUMNS = ["montante", "libre", "seche", "descendante"]
COEFFS = {"montante": 3, "libre": 1, "seche": 4, "descendante": 2}

def create_empty_grid():
    return {row: {col: None for col in COLUMNS} for row in ROWS}

def create_empty_game():
    return {
        "game_id": "DEMO",
        "players": {}
    }

def add_player(game_data, player_name):
    if player_name not in game_data['players']:
        game_data['players'][player_name] = {
            "grid": create_empty_grid(),
            "totals": {"haut": {}, "bas": {}, "final": 0}
        }
    return game_data

def validate_entry(game_data, row, col, value):
    return True

def compute_totals(game_data):
    for team in list(game_data['grids'].keys()):
        if team.endswith("_totals"):
            continue  # Ignore les blocs déjà calculés

        grid = game_data['grids'][team]
        total_col = {}

        for col in ["montante", "libre", "seche", "descendante"]:
            haut = sum(grid[r][col] for r in ["1", "2", "3", "4", "5", "6"] if isinstance(grid[r][col], int))
            bonus = 0
            if haut >= 60:
                bonus = 20 + ((haut - 60) // 10) * 10
            bas = sum(grid[r][col] for r in ["Full", "Carre", "Suite", "Plus", "Moins", "Yam's"] if isinstance(grid[r][col], int))
            total = (haut + bonus + bas) * {"montante": 3, "libre": 1, "seche": 4, "descendante": 2}[col]

            total_col[col] = {
                "haut": haut,
                "bonus": bonus,
                "bas": bas,
                "score": total
            }

        final_score = sum(t["score"] for t in total_col.values())
        game_data['grids'][team + "_totals"] = {**total_col, "final": final_score}

    return game_data
