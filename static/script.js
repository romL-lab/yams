if (!GAME_ID) {
    alert("ID de partie manquant dans l'URL !");
}

// ============================================================
// OFFLINE — autosave localStorage
// ============================================================
const LS_KEY_STATE = `yams:state:${GAME_ID}`;

function saveLocalState(state) {
    try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch (e) {}
}
function loadLocalState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY_STATE) || 'null'); } catch (e) { return null; }
}

// Recalcul côté client (miroir de compute_totals dans app.py)
function computeTotalsAndScores(state) {
    const coeffs     = state.coeffs || { montante: 3, libre: 1, seche: 4, descendante: 2 };
    const catsTop    = ['1', '2', '3', '4', '5', '6'];
    const catsBottom = ['Full', 'Carre', 'Suite', 'Plus', 'Moins', "Yam's"];
    const allCats    = [...catsTop, 'Bonus', ...catsBottom];

    for (const team of state.team_order) {
        const grid = state.grids[team];
        for (const sub of ['montante', 'libre', 'seche', 'descendante']) {
            let totalHaut = 0;
            for (const c of catsTop) {
                const v = grid[c][sub];
                if (v !== null && v !== '' && v !== '✗') totalHaut += parseInt(v, 10);
            }
            grid['total'][sub] = totalHaut || '';
            grid['Bonus'][sub] =
                totalHaut >= 100 ? 60 :
                totalHaut >= 90  ? 50 :
                totalHaut >= 80  ? 40 :
                totalHaut >= 70  ? 30 :
                totalHaut >= 60  ? 20 : '';

            let totalBas = 0;
            for (const c of catsBottom) {
                const v = grid[c][sub];
                if (v !== null && v !== '' && v !== '✗') totalBas += parseInt(v, 10);
            }
            grid['TOTAL'][sub] = totalBas + (grid['total'][sub] || 0) + (grid['Bonus'][sub] || 0);
        }

        let s = 0;
        for (const [col, coeff] of Object.entries(coeffs)) {
            for (const c of allCats) {
                const v = grid[c][col];
                if (v !== null && v !== '' && v !== '✗') s += parseInt(v, 10) * coeff;
            }
        }
        state.scores = state.scores || {};
        state.scores[team] = s;
    }
}

function advanceTurn(state, team) {
    const joueurs = state.teams[team] || [];
    if (joueurs.length) {
        state.main_index[team] = (state.main_index[team] + 1) % joueurs.length;
    }
    state.current_team = (state.current_team + 1) % state.team_order.length;
}

function applyEditOffline(state, payload) {
    const { team, cat, sub, val } = payload;
    state.history = state.history || [];
    state.history.push({ team, cat, sub, old_val: state.grids[team][cat][sub] });
    state.grids[team][cat][sub] = (val === '' ? null : val);
    computeTotalsAndScores(state);
    advanceTurn(state, team);
}

// Applique un coup : essaie le serveur, se rabat sur local si hors ligne
async function applyEdit(payload) {
    try {
        let r = await fetch(`/update_cell/${GAME_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!r.ok) {
            // Serveur a redémarré : on le re-sème depuis le localStorage
            const st = loadLocalState();
            if (st && navigator.onLine) {
                try {
                    const rs = await fetch(`/sync_state/${GAME_ID}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(st)
                    });
                    if (rs.ok) {
                        r = await fetch(`/update_cell/${GAME_ID}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                    }
                } catch (e) {}
            }
        }

        if (r.ok) {
            const data = await r.json();
            if (data?.success) { await fetchState(); return; }
        }

        // Toujours en échec : mode offline
        const st2 = loadLocalState();
        if (st2) { applyEditOffline(st2, payload); saveLocalState(st2); renderAllGrids(st2); }

    } catch (e) {
        // Réseau coupé
        const st = loadLocalState();
        if (st) { applyEditOffline(st, payload); saveLocalState(st); renderAllGrids(st); }
    }
}


// ============================================================
// CONSTANTES
// ============================================================
const CATEGORIES = [
    '1', '2', '3', '4', '5', '6',
    'total', 'Bonus',
    'Full', 'Carre', 'Suite', 'Plus', 'Moins',
    "Yam's", 'TOTAL'
];
const SUB_COLUMNS = ['montante', 'libre', 'seche', 'descendante'];
const SUB_LABELS  = { montante: '↑', libre: 'LIB', seche: 'SEC', descendante: '↓' };

const VALID_VALUES = {
    '1': [1, 2, 3, 4, 5],
    '2': [2, 4, 6, 8, 10],
    '3': [3, 6, 9, 12, 15],
    '4': [4, 8, 12, 16, 20],
    '5': [5, 10, 15, 20, 25],
    '6': [6, 12, 18, 24, 30],
    'Full':  [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 47, 48],
    'Carre': [34, 38, 42, 46, 50, 54],
    'Suite': [55, 60],
    'Moins': Array.from({ length: 10 }, (_, i) => i + 21),
    'Plus':  Array.from({ length: 10 }, (_, i) => i + 21),
    "Yam's": [65, 70, 75, 80, 85, 90]
};


// ============================================================
// FETCH STATE
// ============================================================
// État courant (nécessaire pour la logique Plus/Moins cross-cellules)
let currentState = null;

document.addEventListener('DOMContentLoaded', fetchState);

async function fetchState() {
    try {
        let r = await fetch(`/get_state/${GAME_ID}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        saveLocalState(data);
        renderAllGrids(data);
        return;
    } catch (err) {
        // Serveur hors ligne : on essaie de le re-semer
        const cached = loadLocalState();
        if (cached && navigator.onLine) {
            try {
                const rs = await fetch(`/sync_state/${GAME_ID}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cached)
                });
                if (rs.ok) {
                    const r2 = await fetch(`/get_state/${GAME_ID}`);
                    if (r2.ok) {
                        const data2 = await r2.json();
                        saveLocalState(data2);
                        renderAllGrids(data2);
                        return;
                    }
                }
            } catch (e) {}
        }
        // Dernier recours : local uniquement
        if (cached) {
            renderAllGrids(cached);
        } else {
            const gc = document.getElementById('grids-container');
            if (gc) gc.innerHTML = '<div>Hors ligne et aucune sauvegarde locale disponible.</div>';
        }
    }
}


// ============================================================
// LOGIQUE GRILLE
// ============================================================
function isCellEditable(gameState, team, catIndex, subIndex) {
    const currentTeam    = gameState.team_order[gameState.current_team];
    const isTeamActive   = team === currentTeam;
    const grille         = gameState.grids[team] || {};
    const cat            = CATEGORIES[catIndex];
    const sub            = SUB_COLUMNS[subIndex];
    const valeurCellule  = grille[cat]?.[sub];

    const nonEditableCats = ['total', 'Bonus', 'TOTAL'];
    if (nonEditableCats.includes(cat)) return false;
    if (valeurCellule !== undefined && valeurCellule !== null && valeurCellule !== '') return false;
    if (!isTeamActive) return false;

    if (sub === 'descendante') {
        let nextEditable = null;
        for (let k = 0; k < CATEGORIES.length; k++) {
            const thisCat = CATEGORIES[k];
            if (nonEditableCats.includes(thisCat)) continue;
            const cell = grille[thisCat]?.[sub];
            if (cell === null || cell === undefined || cell === '' || cell === '0') { nextEditable = k; break; }
        }
        return catIndex === nextEditable;
    }

    if (sub === 'montante') {
        let nextEditable = null;
        for (let k = CATEGORIES.length - 1; k >= 0; k--) {
            const thisCat = CATEGORIES[k];
            if (nonEditableCats.includes(thisCat)) continue;
            const cell = grille[thisCat]?.[sub];
            if (cell === null || cell === undefined || cell === '' || cell === '0') { nextEditable = k; break; }
        }
        return catIndex === nextEditable;
    }

    return true;
}


// ============================================================
// RENDU
// ============================================================
function renderAllGrids(state) {
    if (!state || !state.teams) {
        document.getElementById('grids-container').innerHTML = '<div>Aucune partie en cours.</div>';
        return;
    }

    window.currentTeamName = state.team_order[state.current_team];
    currentState = state;

    let html = '<div class="grids-flex">';
    for (const teamName of state.team_order) {
        const joueurs   = state.teams[teamName] || [];
        const grille    = state.grids[teamName] || {};
        const mainIndex = state.main_index?.[teamName] ?? -1;

        const recentMoves = state.history
            .filter(m => m.team === teamName)
            .slice(-3)
            .reverse();

        html += `
        <div class="yams-player-card">
            <div style="font-weight:bold;font-size:1.1em;margin-bottom:4px;color:#e5eaf3;">
                ${teamName}
                <div style="font-size:0.9em;color:#7ca3c6;margin-top:2px;">
                    ${joueurs.map((j, idx) =>
                        idx === mainIndex
                            ? `<span class="main-hand-player">${j} <span title="1ère main">🖐️</span></span>`
                            : j
                    ).join(' / ')}
                </div>
            </div>
            <div class="score-display" style="margin-bottom:7px;">
                Score : <span style="color:#ffd647;font-size:1.15em;font-weight:bold;">
                    ${state.scores?.[teamName] ?? 0}
                </span>
            </div>
            <table class="yams-table">
                <thead>
                    <tr>
                        <th></th>
                        ${SUB_COLUMNS.map(sub => `<th>${SUB_LABELS[sub]}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        for (let i = 0; i < CATEGORIES.length; i++) {
            const cat = CATEGORIES[i];
            let rowClass = '';
            if (cat === 'total') rowClass = 'total-row';
            if (cat === 'Bonus') rowClass = 'bonus-row';
            if (cat === 'TOTAL') rowClass = 'total-bas-row';

            html += `<tr class="${rowClass}">`;
            html += `<td class="cat-label">${cat}</td>`;

            for (let s = 0; s < SUB_COLUMNS.length; s++) {
                const isTotalOrBonus = ['TOTAL', 'total', 'Bonus'].includes(cat);
                const sub = SUB_COLUMNS[s];
                let val = grille[cat]?.[sub] ?? '';
                if ((val === 0 || val === '0') && !isTotalOrBonus) val = '✗';

                const recentIndex = recentMoves.findIndex(m =>
                    String(m.cat).toLowerCase() === String(cat).toLowerCase() &&
                    String(m.sub).toLowerCase() === String(sub).toLowerCase()
                );
                const recentClass = recentIndex >= 0 ? ` recent-move-${recentIndex + 1}` : '';

                html += `<td
                    class="${val !== '' ? 'filled' : (isCellEditable(state, teamName, i, s) ? 'editable' : 'not-editable')}${recentClass}"
                    data-team="${teamName}" data-cat-index="${i}" data-sub-index="${s}"
                >${val}</td>`;
            }
            html += '</tr>';
        }

        html += '</tbody></table></div>';
    }
    html += '</div>';

    document.getElementById('grids-container').innerHTML = html;

    document.querySelectorAll('td.editable').forEach(td => {
        td.addEventListener('click', () => {
            openEditPopup(td.dataset.team, parseInt(td.dataset.catIndex, 10), parseInt(td.dataset.subIndex, 10), td.innerText);
        });
    });

    // Attache le handler undo sur le bouton déjà présent dans le HTML
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.onclick = handleUndo;

    saveLocalState(state);
}


// ============================================================
// POPUP SAISIE — utilise les classes CSS (pas de styles inline)
// ============================================================
function openEditPopup(team, catIndex, subIndex, oldValue) {
    const cat = CATEGORIES[catIndex];
    const sub = SUB_COLUMNS[subIndex];

    // ── Calcul des valeurs valides ───────────────────────────
    let validValues;
    let constraintMsg = '';

    if (cat === 'Plus' || cat === 'Moins') {
        const BASE = Array.from({ length: 10 }, (_, i) => i + 21); // 21..30
        const grille = currentState?.grids[team] || {};

        if (cat === 'Moins') {
            // Moins doit être < Plus (si Plus déjà rempli)
            const plusRaw = grille['Plus']?.[sub];
            const plusVal = (plusRaw !== null && plusRaw !== undefined && plusRaw !== '' && plusRaw !== 0 && plusRaw !== '0' && plusRaw !== '✗')
                ? parseInt(plusRaw, 10) : null;
            if (plusVal !== null) {
                validValues = BASE.filter(v => v < plusVal);
                constraintMsg = `(doit être < ${plusVal})`;
            } else {
                validValues = BASE;
            }
        } else {
            // Plus doit être > Moins (si Moins déjà rempli)
            const moinsRaw = grille['Moins']?.[sub];
            const moinsVal = (moinsRaw !== null && moinsRaw !== undefined && moinsRaw !== '' && moinsRaw !== 0 && moinsRaw !== '0' && moinsRaw !== '✗')
                ? parseInt(moinsRaw, 10) : null;
            if (moinsVal !== null) {
                validValues = BASE.filter(v => v > moinsVal);
                constraintMsg = `(doit être > ${moinsVal})`;
            } else {
                validValues = BASE;
            }
        }
    } else {
        validValues = VALID_VALUES[cat] || Array.from({ length: 101 }, (_, k) => k);
    }
    // ────────────────────────────────────────────────────────

    let buttonsHtml = `<button type="button" class="yams-popup-btn yams-popup-zero" data-val="0">✗ Zéro</button>`;
    validValues.forEach(v => {
        buttonsHtml += `<button type="button" class="yams-popup-btn${oldValue == v ? ' selected' : ''}" data-val="${v}">${v}</button>`;
    });

    const popup = document.createElement('div');
    popup.className = 'yams-popup-overlay';
    popup.innerHTML = `
        <div class="yams-popup-panel">
            <div class="yams-popup-title">
                <strong>${cat}</strong> &mdash; colonne <strong>${SUB_LABELS[SUB_COLUMNS[subIndex]]}</strong>
                ${constraintMsg ? `<span class="yams-popup-constraint">${constraintMsg}</span>` : ''}
            </div>
            <div class="yams-popup-values">${buttonsHtml}</div>
            <div class="yams-popup-footer">
                <button type="button" class="yams-popup-btn yams-popup-cancel">Annuler</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    popup.querySelectorAll('.yams-popup-btn[data-val]').forEach(btn => {
        btn.onclick = function () {
            const val = btn.getAttribute('data-val');
            closePopup();
            applyEdit({
                team,
                cat:  CATEGORIES[catIndex],
                sub:  SUB_COLUMNS[subIndex],
                val:  val === '' ? null : parseInt(val, 10)
            });
        };
    });

    popup.querySelector('.yams-popup-cancel').onclick = closePopup;
    popup.addEventListener('click', e => { if (e.target === popup) closePopup(); });

    function closePopup() { document.body.removeChild(popup); }
}


// ============================================================
// UNDO
// ============================================================
function handleUndo() {
    fetch(`/undo/${GAME_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: window.currentTeamName })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) fetchState();
        else alert(data.message || 'Aucun coup à annuler.');
    });
}
