import uuid
from flask import Flask, render_template, request, jsonify, redirect, url_for
#from flask_cors import CORS

app = Flask(__name__)
#CORS(app)

# Chaque partie aura son propre game_id
games = {}

def create_empty_grid():
    categories = ['1','2','3','4','5','6','total','Bonus','Full','Carre','Suite','Plus','Moins',"Yam's",'TOTAL']
    sub_columns = ['montante','libre','seche','descendante']
    grid = {}
    for cat in categories:
        grid[cat] = {}
        for sub in sub_columns:
            grid[cat][sub] = ""
    return grid

@app.route('/')
def home():
    return redirect(url_for('config_page'))

@app.route('/config')
def config_page():
    return render_template('config.html')

@app.route('/config', methods=['POST'])
def config_post():
    data = request.get_json()
    game_id = str(uuid.uuid4())
    try: 
        # Construire teams en dict {teamName: [joueurs en string]}
        teams_dict = {}
        for team_name, joueurs in data["teams"].items():
            teams_dict[team_name] = [str(j) for j in joueurs]

        # Déterminer main_index à partir de firstMain
        main_index_dict = {}
        for team_name in teams_dict:
            if isinstance(data.get("firstMain"), dict):
                main_index_dict[team_name] = data["firstMain"].get(team_name, 0)
            elif isinstance(data.get("firstMain"), list):
                main_index_dict[team_name] = data["firstMain"][list(teams_dict.keys()).index(team_name)] \
                    if team_name in teams_dict else 0
            else:
                main_index_dict[team_name] = 0

        games[game_id] = {
            "teams": teams_dict,
            "players": data["players"],  # si besoin de garder à part
            "firstMain": data.get("firstMain", []),
            "coeffs": data.get("coeffs", {"montante": 3, "libre": 1, "seche": 4, "descendante": 2}),
            "grids": {team: create_empty_grid() for team in teams_dict},
            "turn_index": 0,
            "team_order": list(teams_dict.keys()),
            "current_team": 0,  # 👈 Ajout pour dire que c'est l'équipe 0 qui commence
            "main_index": main_index_dict,
            "history": [],
            "scores": {team: 0 for team in teams_dict}
        }
        return jsonify({"success": True, "game_id": game_id})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/game/<game_id>')
def game_page(game_id):
    if game_id not in games:
        return "Partie introuvable", 404
    return render_template('index.html', game_id=game_id)

@app.route('/get_state/<game_id>')
def get_state(game_id):
    if game_id not in games:
        return jsonify({"error": "Partie introuvable"}), 404
    return jsonify(games[game_id])

@app.route('/update_cell/<game_id>', methods=['POST'])
def update_cell(game_id):
    if game_id not in games:
        return jsonify({"error": "Partie introuvable"}), 404

    data = request.get_json()
    team = data["team"]
    cat = data["cat"]
    sub = data["sub"]
    val = data["val"]

    # Historique pour Undo
    games[game_id]["history"].append({
        "team": team,
        "cat": cat,
        "sub": sub,
        "old_val": games[game_id]["grids"][team][cat][sub]
    })

    games[game_id]["grids"][team][cat][sub] = val
    compute_totals(games[game_id])

    # 🔄 Avancer main_index dans l'équipe actuelle
    joueurs = games[game_id]["teams"][team]
    if joueurs:  # éviter erreur si équipe vide
        games[game_id]["main_index"][team] = (games[game_id]["main_index"][team] + 1) % len(joueurs)

    # 👥 Passer à l'équipe suivante
    games[game_id]["current_team"] = (games[game_id]["current_team"] + 1) % len(games[game_id]["team_order"])

    return jsonify({"success": True})


@app.route('/undo/<game_id>', methods=['POST'])
def undo(game_id):
    print("UNDO demandé pour", game_id)
    print("HISTO:", games[game_id]["history"])  # debug
    
    if game_id not in games:
        return jsonify({"error": "Partie introuvable"}), 404

    if not games[game_id]["history"]:
        return jsonify({"success": False, "message": "Aucun coup à annuler"})

    last = games[game_id]["history"].pop()
    print("DERNIER COUP:", last)  # debug
    # Remettre l'ancienne valeur
    games[game_id]["grids"][last["team"]][last["cat"]][last["sub"]] = last["old_val"]
    compute_totals(games[game_id])

    # 👥 Revenir à l'équipe précédente
    games[game_id]["current_team"] = (games[game_id]["current_team"] - 1) % len(games[game_id]["team_order"])

    # 🔄 Reculer main_index pour cette équipe
    joueurs = games[game_id]["teams"][last["team"]]
    if joueurs:
        games[game_id]["main_index"][last["team"]] = (games[game_id]["main_index"][last["team"]] - 1) % len(joueurs)

    return jsonify({"success": True})


def compute_totals(game_data):
    coeffs = game_data.get("coeffs", {"montante": 3, "libre": 1, "seche": 4, "descendante": 2})
    for team, grille in game_data["grids"].items():
        for sub in ["montante", "libre", "seche", "descendante"]:
            total_haut = 0
            for cat in ['1', '2', '3', '4', '5', '6']:
                v = grille[cat][sub]
                if v not in (None, "", "✗"):
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
            # TOTAL
            total_bas = 0
            for cat in ['Full', 'Carre', 'Suite', 'Plus', 'Moins', "Yam's"]:
                v = grille[cat][sub]
                if v not in (None, "", "✗"):
                    total_bas += int(v)
            grille['TOTAL'][sub] = (
                total_bas +
                (grille['total'][sub] if grille['total'][sub] else 0) +
                (grille['Bonus'][sub] if grille['Bonus'][sub] else 0)
            )

    # Grand total avec coeffs (inclut désormais le Bonus)
    CATEGORIES = ['1', '2', '3', '4', '5', '6', 'Bonus', 'Full', 'Carre', 'Suite', 'Plus', 'Moins', "Yam's"]
    for team, grid in game_data["grids"].items():
        grand_total = 0
        for col, coeff in coeffs.items():
            for cat in CATEGORIES:
                v = grid.get(cat, {}).get(col)
                if v not in (None, "", "✗"):
                    grand_total += int(v) * coeff
        game_data["scores"][team] = grand_total

    return game_data




def reset_game_state(game):
    """Remet à zéro les grilles et l'état de partie, en conservant équipes/joueurs/coeffs."""
    # 1) grilles neuves pour chaque équipe
    game["grids"] = {team: create_empty_grid() for team in game["teams"].keys()}

    # 2) historique et scores vidés
    game["history"] = []
    game["scores"] = {team: 0 for team in game["teams"].keys()}

    # 3) tour et rotation de première main
    game["turn_index"] = 0
    game["current_team"] = 0
    # remet la première main au premier joueur de chaque équipe (ou garde la même si tu préfères)
    game["main_index"] = {team: 0 for team in game["teams"].keys()}

    # 4) (optionnel) recalcul des totaux sur des grilles vides
    compute_totals(game)

    return game
    
    
@app.post("/game/<game_id>/reset")
def reset_game(game_id):
    if game_id not in games:
        return jsonify({"error": "Partie introuvable"}), 404

    # remet à zéro en conservant équipes / joueurs / coeffs
    reset_game_state(games[game_id])

    return jsonify({"success": True})
    

@app.post('/import_state')
def import_state():
    """Create a new game from a full client-provided state and return its game_id."""
    state = request.get_json() or {}
    # Minimal validation
    required = ['teams','team_order','grids']
    if not all(k in state for k in required):
        return jsonify({'success': False, 'error': 'invalid state'}), 400

    # Ensure defaults that server expects
    state.setdefault('coeffs', {"montante": 3, "libre": 1, "seche": 4, "descendante": 2})
    state.setdefault('history', [])
    state.setdefault('scores', {team: 0 for team in state['teams']})
    state.setdefault('current_team', 0)
    state.setdefault('main_index', {team: 0 for team in state['teams']})

    gid = str(uuid.uuid4())
    games[gid] = state
    return jsonify({'success': True, 'game_id': gid})


@app.post('/sync_state/<game_id>')
def sync_state(game_id):
    """Upsert in-memory game state from client.
    Accepts a full state JSON (teams, team_order, grids, coeffs, main_index, history, scores, current_team, etc.)
    """
    data = request.get_json() or {}
    required = ['teams','team_order','grids']
    if not all(k in data for k in required):
        return jsonify({'success': False, 'error': 'invalid state'}), 400
    games[game_id] = data
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=5000)