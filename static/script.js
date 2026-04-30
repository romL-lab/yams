if (!GAME_ID) {
    alert("ID de partie manquant dans l'URL !");
}

// ============================================================
// OFFLINE autosave localStorage
// ============================================================
const LS_KEY_STATE = `yams:state:${GAME_ID}`;

function saveLocalState(state) {
    try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch (e) {}
}
function loadLocalState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY_STATE) || 'null'); } catch (e) { return null; }
}

function computeTotalsAndScores(state) {
    const coeffs     = state.coeffs || { montante: 3, libre: 1, seche: 3, descendante: 2 };
    const catsTop    = ['1', '2', '3', '4', '5', '6'];
    const catsBottom = ['Full', 'Carre', 'Suite', 'Plus', 'Moins', "Yam's"];
    const allCats    = [...catsTop, 'Bonus', ...catsBottom];

    for (const team of state.team_order) {
        const grid = state.grids[team];
        for (const sub of ['montante', 'libre', 'seche', 'descendante']) {
            let totalHaut = 0;
            for (const c of catsTop) {
                const v = grid[c][sub];
                if (v !== null && v !== '' && v !== '\u2717') totalHaut += parseInt(v, 10);
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
                if (v !== null && v !== '' && v !== '\u2717') totalBas += parseInt(v, 10);
            }
            grid['TOTAL'][sub] = totalBas + (grid['total'][sub] || 0) + (grid['Bonus'][sub] || 0);
        }
        let s = 0;
        for (const [col, coeff] of Object.entries(coeffs)) {
            for (const c of allCats) {
                const v = grid[c][col];
                if (v !== null && v !== '' && v !== '\u2717') s += parseInt(v, 10) * coeff;
            }
        }
        state.scores = state.scores || {};
        state.scores[team] = s;
    }
}

function advanceTurn(state, team) {
    const joueurs = state.teams[team] || [];
    if (joueurs.length) state.main_index[team] = (state.main_index[team] + 1) % joueurs.length;
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

async function applyEdit(payload) {
    try {
        let r = await fetch(`/update_cell/${GAME_ID}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!r.ok) {
            const st = loadLocalState();
            if (st && navigator.onLine) {
                try {
                    const rs = await fetch(`/sync_state/${GAME_ID}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(st)
                    });
                    if (rs.ok) r = await fetch(`/update_cell/${GAME_ID}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } catch (e) {}
            }
        }
        if (r.ok) {
            const data = await r.json();
            if (data && data.success) { await fetchState(); return; }
        }
        const st2 = loadLocalState();
        if (st2) { applyEditOffline(st2, payload); saveLocalState(st2); renderAllGrids(st2); }
    } catch (e) {
        const st = loadLocalState();
        if (st) { applyEditOffline(st, payload); saveLocalState(st); renderAllGrids(st); }
    }
}

// ============================================================
// CONSTANTES
// ============================================================
const CATEGORIES = [
    '1','2','3','4','5','6','total','Bonus',
    'Full','Carre','Suite','Plus','Moins',"Yam's",'TOTAL'
];
const SUB_COLUMNS = ['montante','libre','seche','descendante'];
const SUB_LABELS  = { montante:'\u2191', libre:'LIB', seche:'SEC', descendante:'\u2193' };

const VALID_VALUES = {
    '1':[1,2,3,4,5], '2':[2,4,6,8,10], '3':[3,6,9,12,15],
    '4':[4,8,12,16,20], '5':[5,10,15,20,25], '6':[6,12,18,24,30],
    'Full':[27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,47,48],
    'Carre':[34,38,42,46,50,54], 'Suite':[55,60],
    'Moins':Array.from({length:10},(_,i)=>i+21),
    'Plus':Array.from({length:10},(_,i)=>i+21),
    "Yam's":[65,70,75,80,85,90]
};

let currentState = null;
document.addEventListener('DOMContentLoaded', fetchState);

// ============================================================
// FETCH STATE
// ============================================================
async function fetchState() {
    try {
        let r = await fetch(`/get_state/${GAME_ID}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        saveLocalState(data); renderAllGrids(data); return;
    } catch (err) {
        const cached = loadLocalState();
        if (cached && navigator.onLine) {
            try {
                const rs = await fetch(`/sync_state/${GAME_ID}`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify(cached)
                });
                if (rs.ok) {
                    const r2 = await fetch(`/get_state/${GAME_ID}`);
                    if (r2.ok) { const d2=await r2.json(); saveLocalState(d2); renderAllGrids(d2); return; }
                }
            } catch(e) {}
        }
        if (cached) { renderAllGrids(cached); }
        else {
            const gc = document.getElementById('grids-container');
            if (gc) gc.innerHTML = '<div>Hors ligne et aucune sauvegarde locale.</div>';
        }
    }
}

// ============================================================
// EDITABLE ?
// ============================================================
function isCellEditable(gameState, team, catIndex, subIndex) {
    const currentTeam   = gameState.team_order[gameState.current_team];
    const isTeamActive  = team === currentTeam;
    const grille        = gameState.grids[team] || {};
    const cat           = CATEGORIES[catIndex];
    const sub           = SUB_COLUMNS[subIndex];
    const val           = grille[cat]?.[sub];
    const nonEdit       = ['total','Bonus','TOTAL'];

    if (nonEdit.includes(cat)) return false;
    if (val !== undefined && val !== null && val !== '') return false;
    if (!isTeamActive) return false;

    if (sub === 'descendante') {
        let next = null;
        for (let k=0;k<CATEGORIES.length;k++) {
            if (nonEdit.includes(CATEGORIES[k])) continue;
            const c = grille[CATEGORIES[k]]?.[sub];
            if (c===null||c===undefined||c===''||c==='0'){next=k;break;}
        }
        return catIndex === next;
    }
    if (sub === 'montante') {
        let next = null;
        for (let k=CATEGORIES.length-1;k>=0;k--) {
            if (nonEdit.includes(CATEGORIES[k])) continue;
            const c = grille[CATEGORIES[k]]?.[sub];
            if (c===null||c===undefined||c===''||c==='0'){next=k;break;}
        }
        return catIndex === next;
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
        const recentMoves = state.history.filter(m=>m.team===teamName).slice(-3).reverse();

        html += `<div class="yams-player-card">
            <div style="font-weight:bold;font-size:1.1em;margin-bottom:4px;color:#e5eaf3;">
                ${teamName}
                <div style="font-size:0.9em;color:#7ca3c6;margin-top:2px;">
                    ${joueurs.map((j,idx)=>idx===mainIndex
                        ?`<span class="main-hand-player">${j} <span title="1ere main">\uD83D\uDD90\uFE0F</span></span>`:j
                    ).join(' / ')}
                </div>
            </div>
            <div class="score-display" style="margin-bottom:7px;">
                Score : <span style="color:#ffd647;font-size:1.15em;font-weight:bold;">
                    ${state.scores?.[teamName]??0}
                </span>
            </div>
            <table class="yams-table"><thead><tr><th></th>
                ${SUB_COLUMNS.map(s=>`<th>${SUB_LABELS[s]}</th>`).join('')}
            </tr></thead><tbody>`;

        for (let i=0;i<CATEGORIES.length;i++) {
            const cat = CATEGORIES[i];
            let rowClass = '';
            if (cat==='total') rowClass='total-row';
            if (cat==='Bonus') rowClass='bonus-row';
            if (cat==='TOTAL') rowClass='total-bas-row';
            html += `<tr class="${rowClass}"><td class="cat-label">${cat}</td>`;

            for (let s=0;s<SUB_COLUMNS.length;s++) {
                const isTB = ['TOTAL','total','Bonus'].includes(cat);
                const sub  = SUB_COLUMNS[s];
                let val    = grille[cat]?.[sub]??'';
                if ((val===0||val==='0')&&!isTB) val='\u2717';
                const ri = recentMoves.findIndex(m=>
                    String(m.cat).toLowerCase()===String(cat).toLowerCase()&&
                    String(m.sub).toLowerCase()===String(sub).toLowerCase()
                );
                const rc = ri>=0?` recent-move-${ri+1}`:'';
                html += `<td class="${val!==''?'filled':(isCellEditable(state,teamName,i,s)?'editable':'not-editable')}${rc}"
                    data-team="${teamName}" data-cat-index="${i}" data-sub-index="${s}">${val}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    }
    html += '</div>';
    document.getElementById('grids-container').innerHTML = html;

    document.querySelectorAll('td.editable').forEach(td => {
        td.addEventListener('click', () =>
            openEditPopup(td.dataset.team, parseInt(td.dataset.catIndex,10), parseInt(td.dataset.subIndex,10), td.innerText)
        );
    });

    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.onclick = handleUndo;

    saveLocalState(state);
}

// ============================================================
// POPUP SAISIE
// ============================================================
function openEditPopup(team, catIndex, subIndex, oldValue) {
    const cat = CATEGORIES[catIndex];
    const sub = SUB_COLUMNS[subIndex];

    let validValues, constraintMsg = '';
    if (cat === 'Plus' || cat === 'Moins') {
        const BASE   = Array.from({length:10},(_,i)=>i+21);
        const grille = currentState?.grids[team] || {};
        if (cat === 'Moins') {
            const raw = grille['Plus']?.[sub];
            const pv  = (raw!==null&&raw!==undefined&&raw!==''&&raw!==0&&raw!=='0'&&raw!=='\u2717') ? parseInt(raw,10) : null;
            validValues = pv!==null ? BASE.filter(v=>v<pv) : BASE;
            if (pv!==null) constraintMsg = `(doit \u00eatre < ${pv})`;
        } else {
            const raw = grille['Moins']?.[sub];
            const mv  = (raw!==null&&raw!==undefined&&raw!==''&&raw!==0&&raw!=='0'&&raw!=='\u2717') ? parseInt(raw,10) : null;
            validValues = mv!==null ? BASE.filter(v=>v>mv) : BASE;
            if (mv!==null) constraintMsg = `(doit \u00eatre > ${mv})`;
        }
    } else {
        validValues = VALID_VALUES[cat] || Array.from({length:101},(_,k)=>k);
    }

    let btns = `<button type="button" class="yams-popup-btn yams-popup-zero" data-val="0">\u2717 Z\u00e9ro</button>`;
    validValues.forEach(v => {
        btns += `<button type="button" class="yams-popup-btn${oldValue==v?' selected':''}" data-val="${v}">${v}</button>`;
    });

    const popup = document.createElement('div');
    popup.className = 'yams-popup-overlay';
    popup.innerHTML = `<div class="yams-popup-panel">
        <div class="yams-popup-title">
            <strong>${cat}</strong> &mdash; colonne <strong>${SUB_LABELS[sub]}</strong>
            ${constraintMsg?`<span class="yams-popup-constraint">${constraintMsg}</span>`:''}
        </div>
        <div class="yams-popup-values">${btns}</div>
        <div class="yams-popup-footer">
            <button type="button" class="yams-popup-btn yams-popup-cancel">Annuler</button>
        </div>
    </div>`;
    document.body.appendChild(popup);

    popup.querySelectorAll('.yams-popup-btn[data-val]').forEach(btn => {
        btn.onclick = function() {
            const val   = btn.getAttribute('data-val');
            const isYams = cat==="Yam's" && val!=='0' && val!==null;
            closePopup();
            if (isYams) setTimeout(triggerYamsFireworks, 280);
            applyEdit({ team, cat:CATEGORIES[catIndex], sub:SUB_COLUMNS[subIndex],
                        val: val===''?null:parseInt(val,10) });
        };
    });
    popup.querySelector('.yams-popup-cancel').onclick = closePopup;
    popup.addEventListener('click', e=>{ if(e.target===popup) closePopup(); });
    function closePopup(){ document.body.removeChild(popup); }
}

// ============================================================
// UNDO
// ============================================================
function handleUndo() {
    fetch(`/undo/${GAME_ID}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({team:window.currentTeamName})
    }).then(r=>r.json()).then(data=>{
        if (data.success) fetchState();
        else alert(data.message||'Aucun coup \u00e0 annuler.');
    });
}

// ============================================================
// FEUX D'ARTIFICE + MESSAGE STREET ART
// ============================================================
function triggerYamsFireworks() {
    if (!document.getElementById('yams-fx-style')) {
        const s = document.createElement('style');
        s.id = 'yams-fx-style';
        s.textContent = `@keyframes yamsMsgIn {
            0%  { transform:translate(-50%,-50%) scale(0) rotate(-8deg); opacity:0; }
            65% { transform:translate(-50%,-50%) scale(1.1) rotate(2deg); opacity:1; }
            100%{ transform:translate(-50%,-50%) scale(1) rotate(0deg); opacity:1; }
        }`;
        document.head.appendChild(s);
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;pointer-events:none;overflow:hidden;';

    const canvas = document.createElement('canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';

    // 5 des eparpilles — rotations manuelles
    const diceData = [
        {rot:-32,dy:10,dx:-8}, {rot:17,dy:-13,dx:5},
        {rot:-5,dy:7,dx:1},    {rot:26,dy:-7,dx:-4},
        {rot:-20,dy:11,dx:6}
    ];
    const diceSpans = diceData.map(({rot,dy,dx}) =>
        `<span style="display:inline-block;font-size:.62em;transform:rotate(${rot}deg) translateY(${dy}px) translateX(${dx}px);">\uD83C\uDFB2</span>`
    ).join('');

    const msg = document.createElement('div');
    msg.innerHTML = `YAM'S&nbsp;!<br><span style="display:inline-flex;gap:3px;align-items:flex-end;">${diceSpans}</span>`;

    // Street art : jaune + contour rouge + extrusion 3D
    const styles = [
        'position:absolute','top:42%','left:50%',
        'transform:translate(-50%,-50%) scale(0)',
        "font-family:'Rajdhani','Impact','Arial Black',sans-serif",
        'font-size:clamp(50px,10.5vw,96px)','font-weight:700',
        'color:#ffd647',
        '-webkit-text-stroke:4px #cc1100',
        'paint-order:stroke fill',
        'text-align:center','line-height:1.18','letter-spacing:.04em',
        'text-shadow:3px 3px 0 #bb0000,6px 6px 0 #960000,9px 9px 0 #720000,12px 12px 0 #4e0000,15px 15px 20px rgba(0,0,0,.7)',
        'animation:yamsMsgIn .52s .12s cubic-bezier(.34,1.56,.64,1) both',
        'pointer-events:none',
        'filter:drop-shadow(0 0 22px rgba(255,214,71,.5))'
    ];
    msg.style.cssText = styles.join(';');

    overlay.appendChild(canvas);
    overlay.appendChild(msg);
    document.body.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const COLORS = ['#ffd647','#22d3ee','#a78bfa','#f87171','#34d399','#fb923c','#ffffff','#fbbf24','#ff6347'];
    const particles = [];

    function burst(x, y, n) {
        for (let i=0;i<n;i++) {
            const angle = (Math.PI*2*i/n)+(Math.random()-.5)*.45;
            const spd   = 4+Math.random()*10;
            particles.push({
                x,y, vx:Math.cos(angle)*spd, vy:Math.sin(angle)*spd-1.8,
                color:COLORS[Math.floor(Math.random()*COLORS.length)],
                size:2+Math.random()*5, life:1,
                decay:.012+Math.random()*.016, grav:.12+Math.random()*.09,
                rect:Math.random()>.4, rot:Math.random()*Math.PI*2,
                rotV:(Math.random()-.5)*.28
            });
        }
    }

    const schedule = [
        [0,W*.5,H*.34,85],   [160,W*.25,H*.28,60], [160,W*.75,H*.28,60],
        [380,W*.12,H*.52,50],[380,W*.88,H*.52,50],  [600,W*.5,H*.18,75],
        [860,W*.35,H*.44,55],[860,W*.65,H*.44,55],  [1150,W*.5,H*.36,90]
    ];
    schedule.forEach(([d,x,y,n])=>setTimeout(()=>burst(x,y,n),d));

    const TOTAL=3800, t0=performance.now();

    function draw(now) {
        const elapsed = now-t0;
        ctx.clearRect(0,0,W,H);
        for (let i=particles.length-1;i>=0;i--) {
            const p=particles[i];
            p.x+=p.vx; p.y+=p.vy; p.vy+=p.grav; p.vx*=.985;
            p.life-=p.decay; p.rot+=p.rotV;
            if (p.life<=0){particles.splice(i,1);continue;}
            ctx.save();
            ctx.globalAlpha=Math.min(1,p.life*1.3);
            ctx.fillStyle=p.color;
            ctx.translate(p.x,p.y); ctx.rotate(p.rot);
            if (p.rect) ctx.fillRect(-p.size,-p.size*.38,p.size*2,p.size*.76);
            else { ctx.beginPath(); ctx.arc(0,0,p.size,0,Math.PI*2); ctx.fill(); }
            ctx.restore();
        }
        if (elapsed>2100) msg.style.opacity=Math.max(0,1-(elapsed-2100)/900).toFixed(3);
        if (elapsed<TOTAL||particles.length>0) requestAnimationFrame(draw);
        else overlay.remove();
    }
    requestAnimationFrame(draw);
    setTimeout(()=>{ if(overlay.parentNode) overlay.remove(); },TOTAL+600);
}
