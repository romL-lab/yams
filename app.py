from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

def create_empty_grid():
    categories = [
        '1', '2', '3', '4', '5', '6',
        'total', 'Bonus',
        'Full', 'Carre', 'Suite', 'Plus', 'Moins',
        "Yam's", 'TOTAL'
    ]
    sub_columns = ["montante", "libre", "seche", "descendante"]
    return {cat: {sub: None for sub in sub_columns} for cat in categories}

game_data = {
    "teams": {},
    "grids": {},
    "players": [],
    "first_main": {},
    "main_index": {},
    "team_order": [],
    "current_team": 0,
    "history": {}
}

@app.route("/")
def index():
    return render_template("config.html")

@app.route("/config", methods=["POST"])
def config():
    global game_data
    data = request.json
    team_names = data["teams"]
    players = data["players"]
    first_mains = data["firstMain"]
    game_data = {
        "teams": {},
        "grids": {},
        "players": [],
        "first_main": {},
        "main_index": {},
        "team_order": [],
        "current_team": 0,
        "history": {}
    }
    for name in team_names:
        game_data["teams"][name] = []
        game_data["grids"][name] = create_empty_grid()
    for p in players:
        team = p["team"]
        name = p["name"].strip()
        game_data["teams"][team].append(name)
        game_data["players"].append(name)
    for i, team_name in enumerate(team_names):
        first_player = first_mains[i].strip()
        game_data["first_main"][team_name] = game_data["teams"][team_name].index(first_player)
        game_data["main_index"][team_name] = game_data["first_main"][team_name]
        game_data["team_order"].append(team_name)
    game_data = compute_totals(game_data)
    return jsonify({"success": True})

@app.route("/state")
def state():
    return jsonify(game_data)

@app.route("/update", methods=["POST"])
def update():
    global game_data
    data = request.json
    row_idx = data["row"]
    col_idx = data["col"]
    team = data["team"]
    value = data["value"]
    CATEGORIES = [
        '1', '2', '3', '4', '5', '6',
        'total', 'Bonus',
        'Full', 'Carre', 'Suite', 'Plus', 'Moins',
        "Yam's", 'TOTAL'
    ]
    SUB_COLUMNS = ["montante", "libre", "seche", "descendante"]
    cat = CATEGORIES[row_idx]
    if isinstance(col_idx, int):
        sub = SUB_COLUMNS[col_idx]
    else:
        sub = col_idx

    current = game_data["team_order"][game_data["current_team"]]
    if team != current:
        return jsonify({"success": False, "message": "Ce n'est pas le tour de cette équipe."})

    # Met à jour la grille
    game_data["grids"][team][cat][sub] = value
    game_data = compute_totals(game_data)

    # Historique pour Undo (indente correctement et ajoute le catIndex et subIndex pour revenir en arrière)
    if "history" not in game_data:
        game_data["history"] = {}
    if team not in game_data["history"]:
        game_data["history"][team] = []
    game_data["history"][team].append({
        "cat": cat,
        "sub": sub,
        "row_idx": row_idx,
        "col_idx": col_idx,
        "old_value": value
    })

    # Rotation automatique
    game_data["main_index"][team] = (game_data["main_index"][team] + 1) % len(game_data["teams"][team])
    game_data["current_team"] = (game_data["current_team"] + 1) % len(game_data["team_order"])
    return jsonify({"success": True, "game": game_data})

# --------- Undo ---------

@app.route("/undo", methods=["POST"])
def undo():
    global game_data
    team = game_data["team_order"][(game_data["current_team"] - 1) % len(game_data["team_order"])]
    history = game_data.get("history", {})
    if not history.get(team):
        return jsonify({"success": False, "message": "Aucun coup à annuler pour cette équipe."})

    last = history[team].pop()
    cat = last["cat"]
    sub = last["sub"]
    grid = game_data["grids"][team]
    if cat in grid and sub in grid[cat]:
        grid[cat][sub] = None if cat not in ["TOTAL", "total", "Bonus"] else 0

    # Annulation du tour
    game_data["current_team"] = (game_data["current_team"] - 1) % len(game_data["team_order"])
    game_data["main_index"][team] = (game_data["main_index"][team] - 1) % len(game_data["teams"][team])

    game_data = compute_totals(game_data)
    return jsonify({"success": True, "game": game_data})


@app.route("/game")
def game():
    return render_template("index.html")

def compute_totals(data):
    for team, grille in data["grids"].items():
        for sub in ["montante", "libre", "seche", "descendante"]:
            total_haut = 0
            for cat in ['1','2','3','4','5','6']:
                v = grille[cat][sub]
                if v is not None and v != "":
                    total_haut += int(v)
            grille['total'][sub] = total_haut if total_haut > 0 else ""
            # BONUS
            if total_haut >= 100:
                grille['Bonus'][sub] = 60
            elif total_haut >= 90:
                grille['Bonus'][sub] = 50
            elif total_haut >= 80:
                grille['Bonus'][sub] = 40
            elif total_haut >= 70:
                grille['Bonus'][sub] = 30
            elif total_haut >= 60:
                grille['Bonus'][sub] = 20
            else:
                grille['Bonus'][sub] = ""
            # TOTAL BAS (TOTAL)
            total_bas = 0
            for cat in ['Full', 'Carre', 'Suite', 'Plus', 'Moins', "Yam's"]:
                v = grille[cat][sub]
                if v is not None and v != "":
                    total_bas += int(v)
            grille['TOTAL'][sub] = total_bas + (grille['total'][sub] if grille['total'][sub] else 0) + (grille['Bonus'][sub] if grille['Bonus'][sub] else 0)
            COEFFS = {"montante": 3, "libre": 1, "seche": 4, "descendante": 2}
            CATEGORIES = ['1', '2', '3', '4', '5', '6', 'total', 'Bonus', 'Full', 'Carre', 'Suite', 'Plus', 'Moins', "Yam's", 'TOTAL']
            for team, grid in game_data["grids"].items():
                grand_total = 0
                for col, coeff in COEFFS.items():
                    for cat in CATEGORIES:
                        if cat in ["total", "Bonus", "TOTAL"]:
                            continue
                        v = grid.get(cat, {}).get(col)
                        if v is not None and v != "" and v != "✗":
                            try:
                                grand_total += int(v) * coeff
                            except Exception:
                                pass
                game_data["scores"] = game_data.get("scores", {})
                game_data["scores"][team] = grand_total
    return data





if __name__ == "__main__":
    app.run(debug=True)
