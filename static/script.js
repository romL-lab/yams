// --- Gestion multi-instance ---
// Récupère l'ID de partie depuis l'URL
//const GAME_ID = window.location.pathname.split("/").pop();

// Vérification
if (!GAME_ID) {
    alert("ID de partie manquant dans l'URL !");
}

// === Local autosave & offline mirror ===
const LS_KEY_STATE = `yams:state:${GAME_ID}`;

function saveLocalState(state){
  try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch(e){}
}
function loadLocalState(){
  try { return JSON.parse(localStorage.getItem(LS_KEY_STATE) || "null"); } catch(e){ return null; }
}

function computeTotalsAndScores(state){
  const coeffs = state.coeffs || { montante:3, libre:1, seche:4, descendante:2 };
  const catsTop = ['1','2','3','4','5','6'];
  const catsBottom = ['Full','Carre','Suite','Plus','Moins',"Yam's"];
  const allCats = ['1','2','3','4','5','6','Bonus','Full','Carre','Suite','Plus','Moins',"Yam's"];
  for (const team of state.team_order){
    const grid = state.grids[team];
    for (const sub of ['montante','libre','seche','descendante']){
      let totalHaut = 0;
      for (const c of catsTop){
        const v = grid[c][sub];
        if (v !== null && v !== '' && v !== '✗') totalHaut += parseInt(v,10);
      }
      grid['total'][sub] = totalHaut || "";
      grid['Bonus'][sub] =
        totalHaut >= 100 ? 60 :
        totalHaut >=  90 ? 50 :
        totalHaut >=  80 ? 40 :
        totalHaut >=  70 ? 30 :
        totalHaut >=  60 ? 20 : "";
      let totalBas = 0;
      for (const c of catsBottom){
        const v = grid[c][sub];
        if (v !== null && v !== '' && v !== '✗') totalBas += parseInt(v,10);
      }
      const tH = grid['total'][sub] || 0;
      const b  = grid['Bonus'][sub] || 0;
      grid['TOTAL'][sub] = totalBas + tH + b;
    }
    let s = 0;
    for (const [col, coeff] of Object.entries(coeffs)){
      for (const c of allCats){
        const v = grid[c][col];
        if (v !== null && v !== '' && v !== '✗') s += parseInt(v,10) * coeff;
      }
    }
    state.scores = state.scores || {};
    state.scores[team] = s;
  }
}

function advanceTurn(state, team){
  const joueurs = state.teams[team] || [];
  if (joueurs.length){
    state.main_index[team] = (state.main_index[team] + 1) % joueurs.length;
  }
  state.current_team = (state.current_team + 1) % state.team_order.length;
}

function applyEditOffline(state, payload){
  const { team, cat, sub, val } = payload;
  state.history = state.history || [];
  state.history.push({
    team, cat, sub,
    old_val: state.grids[team][cat][sub]
  });
  state.grids[team][cat][sub] = (val === '' ? null : val);
  computeTotalsAndScores(state);
  advanceTurn(state, team);
}

async function applyEdit(payload){
  try{
    let r = await fetch(`/update_cell/${GAME_ID}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (!r.ok){
      // Try to reseed server from local state, then retry once
      const st = loadLocalState();
      if (st && navigator.onLine){
        try{
          const rs = await fetch(`/sync_state/${GAME_ID}`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(st)
          });
          if (rs.ok){
            r = await fetch(`/update_cell/${GAME_ID}`, {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify(payload)
            });
          }
        }catch(e){}
      }
    }
    if (r.ok){
      const data = await r.json();
      if (data && data.success){
        await fetchState();
        return;
      }
    }
    // Offline or still failing: apply locally
    const st2 = loadLocalState();
    if (st2){ applyEditOffline(st2, payload); saveLocalState(st2); renderAllGrids(st2); }
  }catch(e){
    const st = loadLocalState();
    if (st){ applyEditOffline(st, payload); saveLocalState(st); renderAllGrids(st); }
  }
}


const CATEGORIES = [
  '1', '2', '3', '4', '5', '6',
  'total', 'Bonus',
  'Full', 'Carre', 'Suite', 'Plus', 'Moins',
  "Yam's", 'TOTAL'
];
const SUB_COLUMNS = ["montante", "libre", "seche", "descendante"];
const SUB_LABELS = {montante: "\u2191", libre: "LIB", seche: "SEC", descendante: "\u2193"};

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

async function fetchState(){
  try{
    let r = await fetch(`/get_state/${GAME_ID}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    saveLocalState(data);
    renderAllGrids(data);
    return;
  }catch(err){
    // Server unreachable or returned non-2xx: try to reseed from local, then retry once
    const cached = loadLocalState();
    if (cached && navigator.onLine){
      try{
        const rs = await fetch(`/sync_state/${GAME_ID}`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(cached)
        });
        if (rs.ok){
          let r2 = await fetch(`/get_state/${GAME_ID}`);
          if (r2.ok){
            const data2 = await r2.json();
            saveLocalState(data2);
            renderAllGrids(data2);
            return;
          }
        }
      }catch(e){}
    }
    // Final fallback: local-only
    if (cached){
      renderAllGrids(cached);
    } else {
      const gc = document.getElementById('grids-container');
      if (gc) gc.innerHTML = "<div>Hors ligne et aucune sauvegarde locale disponible.</div>";
    }
  }
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

    saveLocalState(state);
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
        applyEdit({ team: team, cat: CATEGORIES[catIndex], sub: SUB_COLUMNS[subIndex], val: (val === '' ? null : parseInt(val,10)) });
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


