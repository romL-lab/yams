const CATEGORIES = [
  '1', '2', '3', '4', '5', '6',
  'total', 'Bonus',
  'Full', 'Carre', 'Suite', 'Plus', 'Moins',
  "Yam's", 'TOTAL'
];
const SUB_COLUMNS = ["montante", "libre", "seche", "descendante"];
const SUB_LABELS = {montante: "↑", libre: "LIB", seche: "SEC", descendante: "↓"};

const VALID_VALUES = {
  "1": [1, 2, 3, 4, 5].map(n => n * 1),
  "2": [1, 2, 3, 4, 5].map(n => n * 2),
  "3": [1, 2, 3, 4, 5].map(n => n * 3),
  "4": [1, 2, 3, 4, 5].map(n => n * 4),
  "5": [1, 2, 3, 4, 5].map(n => n * 5),
  "6": [1, 2, 3, 4, 5].map(n => n * 6),
  "Full": [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 47, 48],
  "Carre": [34, 38, 42, 46, 50, 54],
  "Suite": [55, 60],
  "Moins": Array.from({ length: 10 }, (_, i) => i + 21),
  "Plus": Array.from({ length: 10 }, (_, i) => i + 21),
  "Yam's": [65, 70, 75, 80, 85, 90]
};

document.addEventListener("DOMContentLoaded", fetchState);

function fetchState() {
    fetch('/state')
        .then(r => r.json())
        .then(data => renderAllGrids(data));
}

function isCellEditable(gameState, team, catIndex, subIndex) {
    const currentTeam = gameState.team_order[gameState.current_team];
    const isTeamActive = team === currentTeam;
    const grille = gameState.grids[team] || {};
    const cat = CATEGORIES[catIndex];
    const sub = SUB_COLUMNS[subIndex];
    const valeurCellule = grille[cat]?.[sub];

    // Non éditable si Total, Bonus, TOTAL
    const nonEditableCats = ['total', 'Bonus', 'TOTAL'];
    if (nonEditableCats.includes(cat)) return false;

    // Déjà remplie
    if (valeurCellule !== undefined && valeurCellule !== null && valeurCellule !== '') return false;

    // Bon tour ?
    if (!isTeamActive) return false;

    // Descendante : une seule case éditable à la fois du haut vers le bas
    if (sub === "descendante") {
        let nextEditable = null;
        for (let k = 0; k < CATEGORIES.length; k++) {
            let thisCat = CATEGORIES[k];
            if (nonEditableCats.includes(thisCat)) continue;
            const cell = grille[thisCat]?.[sub];
            if (cell === null || cell === undefined || cell === "" || cell === "0") {
                nextEditable = k;
                break;
            }
        }
        return catIndex === nextEditable;
    }
    // Montante : une seule case éditable à la fois du bas vers le haut
    if (sub === "montante") {
        let nextEditable = null;
        for (let k = CATEGORIES.length - 1; k >= 0; k--) {
            let thisCat = CATEGORIES[k];
            if (nonEditableCats.includes(thisCat)) continue;
            const cell = grille[thisCat]?.[sub];
            if (cell === null || cell === undefined || cell === "" || cell === "0") {
                nextEditable = k;
                break;
            }
        }
        return catIndex === nextEditable;
    }
    // Sec et Libre : edit si c’est le tour et case vide
    return true;
}

function renderAllGrids(state) {
    let html = '';
    if (!state || !state.teams) {
        document.getElementById('grids-container').innerHTML = "<div>Aucune partie en cours.</div>";
        return;
    }
	window.currentTeamName = state.team_order[state.current_team];
    html += '<div class="grids-flex">';
    for (let teamName of state.team_order) {
        let joueurs = state.teams[teamName] || [];
        let grille = state.grids[teamName] || {};
        html += `
        <div class="yams-player-card">
            <div style="font-weight: bold; font-size:1.13em; margin-bottom:4px; color:#e5eaf3;">
                ${teamName} 
                <span style="font-size:0.93em;color:#7ca3c6;">
                    (${joueurs.map((j, idx) => idx === state.main_index[teamName] ? '<span class="main-hand-player">'+j+' <span title="Joueur en 1ère main">🖐️</span></span>' : j).join(" / ")})
                </span>
            </div>
            <div class="score-display" style="margin-bottom: 7px;">
                Score : <span style="color:#ffd647; font-size:1.18em; font-weight:bold;">
               ${(state.scores && state.scores[teamName]) ? state.scores[teamName] : 0}
                </span>
            </div>
            <table class="yams-table">
                <thead>
                    <tr>
                        <th></th>
                        ${SUB_COLUMNS.map(sub => `<th>${SUB_LABELS[sub]}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
        `;
        for (let i = 0; i < CATEGORIES.length; i++) {
            let cat = CATEGORIES[i];
            let rowClass = '';
            if (cat === 'total') rowClass = 'total-row';
            if (cat === 'Bonus') rowClass = 'bonus-row';
            if (cat === 'TOTAL') rowClass = 'total-bas-row';

            html += `<tr class="${rowClass}">`;
            html += `<td class="cat-label">${cat === 'total' ? 'total' : (cat === 'TOTAL' ? 'TOTAL' : cat)}</td>`;
            for (let s = 0; s < SUB_COLUMNS.length; s++) {
                let isTotalOrBonus = ['TOTAL', 'total', 'Bonus'].includes(cat);
				let sub = SUB_COLUMNS[s];
                let val = grille[cat] && grille[cat][sub] !== undefined && grille[cat][sub] !== null ? grille[cat][sub] : "";
                // Rendu du zéro en burette (croix)
               if ((val === 0 || val === "0") && !isTotalOrBonus) val = "✗"; 
                html += `<td 
                    class="${val !== "" ? "filled" : (isCellEditable(state, teamName, i, s) ? "editable" : "not-editable")}"
                    data-team="${teamName}" data-cat-index="${i}" data-sub-index="${s}"
                >${val}</td>`;
            }
            html += `</tr>`;
        }
        html += `</tbody></table></div>`;
    }
    html += '</div>';
    document.getElementById('grids-container').innerHTML = html;

    document.querySelectorAll('td.editable').forEach(td => {
        td.addEventListener('click', (e) => {
            const team = td.getAttribute('data-team');
            const catIndex = parseInt(td.getAttribute('data-cat-index'), 10);
            const subIndex = parseInt(td.getAttribute('data-sub-index'), 10);
            openEditPopup(team, catIndex, subIndex, td.innerText);
        });
    });
}

function openEditPopup(team, catIndex, subIndex, oldValue) {
    const cat = CATEGORIES[catIndex];
    const validValues = VALID_VALUES[cat] || Array.from({length: 101}, (_, k) => k);
    let buttonsHtml = '';
    // Ajoute le bouton "burette" (croix pour zéro)
    buttonsHtml += `
        <button type="button" class="yams-popup-btn" data-val="0" style="color:#e33;font-size:1.3em;">
            ✗
        </button>
    `;
    validValues.forEach(v => {
        buttonsHtml += `
            <button type="button" class="yams-popup-btn${oldValue == v ? " selected" : ""}" data-val="${v}">
                ${v}
            </button>
        `;
    });
    let popup = document.createElement('div');
    popup.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;">
            <div style="background:#232628;padding:22px 18px 18px 18px;border-radius:12px;min-width:220px;max-width:96vw;">
                <div style="margin-bottom:12px;text-align:center;">
                    <b>${CATEGORIES[catIndex]}</b> / <b>${SUB_LABELS[SUB_COLUMNS[subIndex]]}</b>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-height:32vh;overflow-y:auto;">
                    ${buttonsHtml}
                </div>
                <div style="margin-top:22px;text-align:center;">
                    <button id="popup-cancel" class="yams-popup-btn" style="background:#45494d;">Annuler</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    if (!document.getElementById('yams-popup-btn-css')) {
        const style = document.createElement('style');
        style.id = 'yams-popup-btn-css';
        style.innerHTML = `
            .yams-popup-btn {
                background: #33383d;
                color: #e3eaf4;
                border: none;
                border-radius: 7px;
                padding: 10px 18px;
                margin: 3px 0;
                font-size: 1.13em;
                font-weight: 700;
                box-shadow: 0 2px 8px #21252944;
                cursor: pointer;
                transition: background 0.2s, color 0.2s, box-shadow 0.2s;
            }
            .yams-popup-btn.selected,
            .yams-popup-btn:focus {
                background: #4d7cb3;
                color: #f3f7fa;
                outline: none;
                box-shadow: 0 4px 12px #427eb744;
            }
            .yams-popup-btn:hover {
                background: #506278;
                color: #ecf2fb;
            }
        `;
        document.head.appendChild(style);
    }
    popup.querySelectorAll('.yams-popup-btn[data-val]').forEach(btn => {
        btn.onclick = function() {
            let val = btn.getAttribute('data-val');
            closePopup();
            fetch('/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    row: catIndex,
                    col: subIndex,
                    value: val === '' ? null : parseInt(val, 10),
                    team: team
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    fetchState();
                } else {
                    alert(data.message || "Erreur lors de l'enregistrement du score.");
                }
            });
        };
    });
    document.getElementById('popup-cancel').onclick = closePopup;
    function closePopup() {
        document.body.removeChild(popup);
    }
	
function addUndoButton() {
    if (!document.getElementById("undo-btn")) {
        const btn = document.createElement("button");
        btn.id = "undo-btn";
        btn.innerText = "Annuler le dernier coup";
        btn.className = "yams-btn";
        btn.style.margin = "15px 0 25px 15px";
        btn.onclick = function() {
            // Par défaut, annule pour l’équipe en cours
            fetch('/undo', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({team: window.lastTeamPlayed || window.currentTeamName})
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) fetchState();
                else alert(data.message || "Rien à annuler.");
            });
        };
        document.querySelector('.main-container').insertBefore(btn, document.getElementById("scores-box"));
    }
}

}
document.addEventListener("DOMContentLoaded", () => {
    fetchState();
    // Branche le bouton Undo
    const undoBtn = document.getElementById("undo-btn");
    if (undoBtn) {
        undoBtn.onclick = function() {
            // Récupère l'équipe en cours
            fetch('/undo', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    team: window.currentTeamName // ou le nom d'équipe en cours (tu dois définir window.currentTeamName)
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) fetchState();
                else alert(data.message || "Rien à annuler.");
            });
        }
    }
});