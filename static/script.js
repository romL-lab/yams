// --- Gestion multi-instance ---
// Récupère l'ID de partie depuis l'URL
//const GAME_ID = window.location.pathname.split("/").pop();

// Vérification
if (!GAME_ID) {
    alert("ID de partie manquant dans l'URL !");
}

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
    fetch(`/get_state/${GAME_ID}`)
        .then(r => r.json())
        .then(data => {
            console.log("STATE:", data);
            console.log("team_order:", data.team_order);
            console.log("current_team:", data.current_team);
            console.log("grids sample:", data.grids[data.team_order[0]]);	

            renderAllGrids(data);
        });
}

function isCellEditable(gameState, team, catIndex, subIndex) {
    const currentTeam = gameState.team_order[gameState.current_team];
    const isTeamActive = team === currentTeam;
    const grille = gameState.grids[team] || {};
    const cat = CATEGORIES[catIndex];
    const sub = SUB_COLUMNS[subIndex];
    const valeurCellule = grille[cat]?.[sub];

    const nonEditableCats = ['total', 'Bonus', 'TOTAL'];
    if (nonEditableCats.includes(cat)) return false;

    if (valeurCellule !== undefined && valeurCellule !== null && valeurCellule !== '') return false;
    if (!isTeamActive) return false;

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
        let mainIndex = state.main_index && state.main_index[teamName] !== undefined ? state.main_index[teamName] : -1;

        // 🔹 Les 3 derniers coups pour CETTE équipe uniquement
        const recentMoves = state.history
            .filter(m => m.team === teamName)
            .slice(-3)
            .reverse();

        html += `
        <div class="yams-player-card">
			<div style="font-weight: bold; font-size:1.13em; margin-bottom:4px; color:#e5eaf3;">
				${teamName}
				<div style="font-size:0.93em; color:#7ca3c6; margin-top:2px;">
					${joueurs.map((j, idx) => 
						idx === mainIndex
							? `<span class="main-hand-player">${j} <span title="Joueur en 1ère main">🖐️</span></span>`
							: j
					).join(" / ")}
				</div>
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
            html += `<td class="cat-label">${cat}</td>`;
            for (let s = 0; s < SUB_COLUMNS.length; s++) {
                let isTotalOrBonus = ['TOTAL', 'total', 'Bonus'].includes(cat);
                let sub = SUB_COLUMNS[s];
                let val = grille[cat]?.[sub] ?? "";
                if ((val === 0 || val === "0") && !isTotalOrBonus) val = "✗";

                // 🔹 Vérifie si c'est un des 3 derniers coups de CETTE grille
                let recentIndex = recentMoves.findIndex(m =>
                    String(m.cat).toLowerCase() === String(cat).toLowerCase() &&
                    String(m.sub).toLowerCase() === String(sub).toLowerCase()
                );
                let recentClass = recentIndex >= 0 ? ` recent-move-${recentIndex + 1}` : "";

                html += `<td 
                    class="${val !== "" ? "filled" : (isCellEditable(state, teamName, i, s) ? "editable" : "not-editable")}${recentClass}"
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
        td.addEventListener('click', () => {
            const team = td.dataset.team;
            const catIndex = parseInt(td.dataset.catIndex, 10);
            const subIndex = parseInt(td.dataset.subIndex, 10);
            openEditPopup(team, catIndex, subIndex, td.innerText);
        });
    });
    addUndoButton();
}



function openEditPopup(team, catIndex, subIndex, oldValue) {
    const cat = CATEGORIES[catIndex];
    const validValues = VALID_VALUES[cat] || Array.from({length: 101}, (_, k) => k);
    let buttonsHtml = `
        <button type="button" class="yams-popup-btn" data-val="0" style="color:#e33;font-size:1.3em;">✗</button>
    `;
    validValues.forEach(v => {
        buttonsHtml += `<button type="button" class="yams-popup-btn${oldValue == v ? " selected" : ""}" data-val="${v}">${v}</button>`;
    });
    let popup = document.createElement('div');
    popup.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;">
            <div style="background:#232628;padding:22px 18px;border-radius:12px;min-width:220px;max-width:96vw;">
                <div style="margin-bottom:12px;text-align:center;">
                    <b>${cat}</b> / <b>${SUB_LABELS[SUB_COLUMNS[subIndex]]}</b>
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

popup.querySelectorAll('.yams-popup-btn[data-val]').forEach(btn => {
    btn.onclick = function() {
        let val = btn.getAttribute('data-val');
        closePopup();
        fetch(`/update_cell/${GAME_ID}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                team: team,
                cat: CATEGORIES[catIndex],
                sub: SUB_COLUMNS[subIndex],
                val: val === '' ? null : parseInt(val, 10)
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
}


function addUndoButton() {
    if (!document.getElementById('undo-btn')) {
        const btn = document.createElement('button');
        btn.id = "undo-btn";
        btn.className = "yams-btn";
        btn.innerText = "Annuler dernier coup";
        btn.style.marginBottom = "22px";
        btn.onclick = handleUndo;
        document.querySelector('.main-container').insertBefore(btn, document.getElementById('grids-container'));
    } else {
        document.getElementById('undo-btn').onclick = handleUndo;
    }
}

function handleUndo() {
    fetch(`/undo/${GAME_ID}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ team: window.currentTeamName })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            fetchState();
        } else {
            alert(data.message || "Aucun coup à annuler pour cette équipe.");
        }
    });
}



