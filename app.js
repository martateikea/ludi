// Ludi · app. Los datos viven en Google Sheets; este archivo habla con el puente de Apps Script.
const API = 'https://script.google.com/macros/s/AKfycbzJtmDxn8l-Sn6rG8hGt6qvrnNFZJxW-MZet08B45mF-YFxBJxPfqam29IyecYSObCxtw/exec';

const LS = {pin:'ludi-pin', me:'ludi-me', cache:'ludi-cache'};
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(e){} },
  del(k){ try { localStorage.removeItem(k); } catch(e){} },
};

const DAY = 864e5;
const iso = d => { const x = new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
const uid = () => Math.random().toString(36).slice(2,10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);
const clean = s => String(s || '').replace(/,/g,' ').trim();

let db = (() => { try { return JSON.parse(store.get(LS.cache)); } catch(e){ return null; } })() || {games:[], matches:[], players:[], tags:[]};
let pin = store.get(LS.pin);
let me = store.get(LS.me);

const ui = {
  tab:'ludo',
  f:{q:'', tag:null, owned:false, n:0},
  period:'mes',
  draft:null,
  sheet:null,
  armed:null,      // partida pendiente de confirmar borrado
  loginErr:'',
  busy:false,
};
const newDraft = () => ({game:null, q:'', players:house().map(p=>p.id), winners:[], author:me || (house()[0]||{}).id || '', date:iso(Date.now()), adding:false});

/* ---------- datos ---------- */
const P = id => db.players.find(p=>p.id===id) || {id, name:id};
const G = id => db.games.find(g=>g.id===id);
const house = () => db.players.filter(p=>p.house);
const hash = s => [...String(s)].reduce((a,c)=> (a*31 + c.charCodeAt(0)) >>> 0, 7);
const initials = n => { const w = String(n).replace(/[^\p{L}\p{N}\s]/gu,'').trim().split(/\s+/).filter(Boolean); return ((w[0]||'?')[0] + (w[1]? w[1][0] : (w[0]||'')[1]||'')).toUpperCase(); };
const cover = (g, extra='') => `<div class="cover" style="--l:${46 + (hash(g.id||g.name) % 6) * 4}%"><span>${esc(initials(g.name||'?'))}</span>${g.cover?`<img src="${esc(g.cover)}" alt="" loading="lazy" onerror="this.remove()">`:''}${extra}</div>`;
const stars = n => `<span class="stars" aria-label="${n} de 5 estrellas">${[1,2,3,4,5].map(i=>`<i class="${i<=n?'on':''}">★</i>`).join('')}</span>`;
const av = p => `<span class="av">${esc(String(p.name||'?')[0].toUpperCase())}</span>`;
const incomplete = g => !g.tags.length || !g.max;
const playersTxt = g => !g.max ? 'Jugadores sin definir' : (g.opt && g.opt!==g.max ? `Ópt. ${g.opt} · máx. ${g.max}` : `${g.max} jugadores`);
const fmtDate = s => {
  const d = new Date(s+'T12:00:00'); const diff = Math.round((new Date(iso(Date.now())+'T12:00:00') - d)/DAY);
  if (isNaN(diff)) return s;
  if (diff===0) return 'Hoy'; if (diff===1) return 'Ayer'; if (diff>1 && diff<7) return `Hace ${diff} días`;
  return d.toLocaleDateString('es-ES',{day:'numeric',month:'short'});
};
const monthName = () => new Date().toLocaleDateString('es-ES',{month:'long'});
const inMonth = s => String(s).slice(0,7) === iso(Date.now()).slice(0,7);
const timesPlayed = id => db.matches.filter(m=>m.game===id).length;
const lastPlayed = id => db.matches.filter(m=>m.game===id).map(m=>m.date).sort().pop();
const gameName = m => (G(m.game)||{}).name || m.gameName || '?';

/* ---------- conexión ---------- */
function setSync(s){
  const el = $('#sync'); el.dataset.s = s;
  el.textContent = {idle:'Conectando', ok:'Sincronizado', saving:'Guardando', error:'Sin conexión'}[s];
}
async function api(action, payload={}, usePin=pin){
  const r = await fetch(API, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({pin:usePin, action, ...payload})});
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Error desconocido');
  return j.data;
}
function accept(data){
  db = data; store.set(LS.cache, JSON.stringify(db));
}
const typing = () => { const a = document.activeElement; return a && (a.tagName==='INPUT') && !ui.sheet; };
async function sync(action, payload){
  setSync('saving');
  try {
    accept(await api(action, payload));
    setSync('ok');
    if (!typing()) render(); else if (ui.tab==='ludo') renderGrid(); else if (ui.tab==='partida') renderPicker();
    return true;
  } catch(e){
    setSync('error');
    if (/PIN/.test(e.message)) { logout(e.message); return false; }
    toast(e.message.includes('fetch') ? 'Sin conexión: no se ha guardado' : e.message);
    refresh();
    return false;
  }
}
async function refresh(){
  if (!pin) return;
  try { accept(await api('read')); setSync('ok'); if (!typing() && !ui.sheet) render(); }
  catch(e){ setSync('error'); if (/PIN/.test(e.message)) logout(e.message); }
}
function logout(msg){
  pin = null; store.del(LS.pin); ui.loginErr = msg || ''; render();
}

/* ---------- entrada ---------- */
function viewLogin(){
  if (!pin) return `
  <div class="login">
    <div class="title"><div><h1>Hola</h1><p>Escribe el PIN de casa para entrar.</p></div></div>
    <form class="panel glass" id="login-form">
      <label class="label" for="pin">PIN de casa</label>
      <input class="input" id="pin" type="password" autocomplete="current-password" inputmode="numeric" required>
      <p class="err" role="alert">${esc(ui.loginErr)}</p>
      <button class="btn ink full" type="submit" ${ui.busy?'disabled':''}>${ui.busy?'Entrando…':'Entrar'}</button>
    </form>
  </div>`;
  return `
  <div class="login">
    <div class="title"><div><h1>¿Quién eres?</h1><p>Lo usaremos para saber quién apunta cada cosa. Solo se pregunta una vez en este móvil.</p></div></div>
    <div class="winners">${house().map(p=>`<button class="win" data-act="pick-me" data-id="${esc(p.id)}">${av(p)}${esc(p.name)}</button>`).join('')}</div>
  </div>`;
}

/* ---------- Juegos ---------- */
function viewLudo(){
  const owned = db.games.filter(g=>g.owned).length;
  return `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div class="title">
      <div><h1>Juegos de Mesa</h1><p class="num">${db.games.length} juegos · ${owned} en casa</p></div>
      <button class="btn ink" data-act="new-game"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Juego</button>
    </div>
    <label class="search glass">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="q" type="search" placeholder="Buscar juego" value="${esc(ui.f.q)}" autocomplete="off">
    </label>
    <div class="chips" role="group" aria-label="Filtros">
      <button class="chip" data-act="f-owned" aria-pressed="${ui.f.owned}">En casa</button>
      ${db.tags.map(t=>`<button class="chip" data-act="f-tag" data-v="${esc(t)}" aria-pressed="${ui.f.tag===t}">${esc(t)}</button>`).join('')}
    </div>
    <div class="row">
      <span class="label">Para cuántos</span>
      <div class="seg glass" role="group" aria-label="Número de jugadores">
        ${[[0,'Todos'],[2,'2'],[3,'3'],[4,'4'],[5,'5+']].map(([v,l])=>`<button data-act="f-n" data-v="${v}" aria-pressed="${ui.f.n===v}">${l}</button>`).join('')}
      </div>
    </div>
    <div id="grid"></div>
  </div>`;
}
function renderGrid(){
  const {q,tag,owned,n} = ui.f;
  const list = db.games
    .filter(g => !q || g.name.toLowerCase().includes(q.toLowerCase()))
    .filter(g => !tag || g.tags.includes(tag))
    .filter(g => !owned || g.owned)
    .filter(g => !n || (g.max && g.max >= n))
    .sort((a,b)=> (n ? Math.abs((a.opt||a.max)-n) - Math.abs((b.opt||b.max)-n) : 0) || b.stars-a.stars || timesPlayed(b.id)-timesPlayed(a.id) || a.name.localeCompare(b.name));
  $('#grid').innerHTML = list.length ? `<div class="grid">${list.map(g=>`
    <button class="card glass" data-act="open-game" data-id="${esc(g.id)}">
      ${cover(g, `<em class="badge ${g.owned?'':'out'}">${g.owned?'En casa':'Jugado fuera'}</em>${incomplete(g)?'<em class="badge todo">Por completar</em>':''}`)}
      <div class="meta">
        <h3>${esc(g.name)}</h3>
        ${stars(g.stars)}
        <small class="num">${playersTxt(g)}</small>
      </div>
    </button>`).join('')}</div>`
    : `<div class="empty glass">${db.games.length ? 'Ningún juego con estos filtros.' : 'Aún no hay juegos. Añade el primero con el botón «Juego».'}</div>`;
}

/* ---------- Nueva partida ---------- */
function viewPartida(){
  const d = ui.draft;
  const ready = d.game && d.players.length && d.winners.length;
  const recent = [...db.matches].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  return `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div class="title"><div><h1>Nueva partida</h1><p>Tres toques y a la siguiente.</p></div></div>

    <section class="panel glass">
      <h2><span class="step">1</span>¿A qué habéis jugado?</h2>
      <label class="search glass" style="height:42px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="pq" type="search" placeholder="Busca o escribe uno nuevo" value="${esc(d.q)}" autocomplete="off">
      </label>
      <div class="picker" id="picker"></div>
    </section>

    <section class="panel glass">
      <h2><span class="step">2</span>¿Quién juega?</h2>
      <div class="chips wrap" role="group" aria-label="Jugadores">
        ${db.players.map(p=>`<button class="chip" data-act="d-player" data-id="${esc(p.id)}" aria-pressed="${d.players.includes(p.id)}" style="padding-left:14px">${av(p)}${esc(p.name)}</button>`).join('')}
        ${d.adding
          ? `<span class="chip add"><input id="friend" placeholder="Nombre" maxlength="18" aria-label="Nombre del amigo" enterkeyhint="done"></span>`
          : `<button class="chip add" data-act="add-friend">+ Amigo</button>`}
      </div>
    </section>

    <section class="panel glass">
      <h2><span class="step">3</span>¿Quién gana?</h2>
      ${d.players.length ? `<div class="winners">${d.players.map(id=>{const p=P(id);return `
        <button class="win" data-act="d-win" data-id="${esc(id)}" aria-pressed="${d.winners.includes(id)}">
          <svg class="crown" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7Z"/></svg>
          ${av(p)}${esc(p.name)}
        </button>`}).join('')}</div>
        <p class="hint">Toca la corona. Si hay empate, marca a más de uno.</p>`
      : `<p class="hint">Primero elige quién juega.</p>`}
    </section>

    <div class="row">
      <label class="label" for="d-date">Fecha</label>
      <input class="input" id="d-date" type="date" value="${esc(d.date)}" max="${iso(Date.now())}" style="height:40px;font-size:14px">
    </div>
    <div class="row">
      <span class="label">Lo apunta</span>
      <div class="seg glass" role="group" aria-label="Quién lo apunta">
        ${house().map(p=>`<button data-act="d-author" data-id="${esc(p.id)}" aria-pressed="${d.author===p.id}">${esc(p.name)}</button>`).join('')}
      </div>
    </div>

    <button class="btn ink full" data-act="save-match" ${ready?'':'disabled'}>Guardar partida</button>

    <section class="panel glass">
      <h2>Últimas partidas</h2>
      ${matchList(recent, true)}
    </section>
  </div>`;
}
function renderPicker(){
  const d = ui.draft, q = d.q.trim().toLowerCase();
  const list = db.games
    .filter(g => !q || g.name.toLowerCase().includes(q))
    .sort((a,b)=> (lastPlayed(b.id)||'').localeCompare(lastPlayed(a.id)||'') || a.name.localeCompare(b.name));
  const exact = db.games.some(g=>g.name.toLowerCase()===q);
  $('#picker').innerHTML = list.map(g=>`
    <button class="pick" data-act="d-game" data-id="${esc(g.id)}" aria-pressed="${d.game===g.id}">${cover(g)}<span class="nm">${esc(g.name)}</span></button>`).join('')
    + (q && !exact ? `<button class="pick create" data-act="d-create"><div class="cover"><span>+</span></div><span class="nm">Crear «${esc(d.q.trim())}»</span></button>` : '');
}
function matchList(ms, deletable){
  if (!ms.length) return `<p class="hint">Todavía no hay partidas. ¡A jugar!</p>`;
  return `<div class="list">${ms.map(m=>{const g=G(m.game)||{id:m.game,name:gameName(m)};return `
    <div class="li">${cover(g)}
      <div class="txt"><b>${esc(g.name)}</b><small>Gana ${m.winners.map(w=>esc(P(w).name)).join(' y ')} · ${m.players.length} jugadores${m.author?` · apuntó ${esc(m.author)}`:''}</small></div>
      ${deletable && ui.armed===m.id
        ? `<button class="del" data-act="del-match" data-id="${esc(m.id)}" data-armed="true">¿Borrar?</button>`
        : `<span class="when">${fmtDate(m.date)}</span>${deletable?`<button class="del" data-act="del-match" data-id="${esc(m.id)}" aria-label="Borrar partida">✕</button>`:''}`}
    </div>`}).join('')}</div>`;
}

/* ---------- Ranking ---------- */
function stats(ms){
  const t = {};
  ms.forEach(m=>{ m.players.forEach(p=>{ t[p] ??= {id:p,w:0,n:0}; t[p].n++; }); m.winners.forEach(w=>{ t[w] ??= {id:w,w:0,n:0}; t[w].w++; }); });
  return Object.values(t).sort((a,b)=> b.w-a.w || (b.w/(b.n||1))-(a.w/(a.n||1)) || b.n-a.n);
}
function viewRanking(){
  const ms = ui.period==='mes' ? db.matches.filter(m=>inMonth(m.date)) : db.matches;
  const rk = stats(ms);
  const top = [rk[1],rk[0],rk[2]];
  const monthMs = db.matches.filter(m=>inMonth(m.date));
  const byGame = {}; monthMs.forEach(m=> byGame[m.game]=(byGame[m.game]||0)+1);
  const games = Object.entries(byGame).sort((a,b)=>b[1]-a[1]);
  const max = games.length ? games[0][1] : 1;
  const nameOf = id => (G(id)||{}).name || (monthMs.find(m=>m.game===id)||{}).gameName || '?';
  let gotm;
  if (games.length){
    const gid = games[0][0]; const g = G(gid) || {id:gid, name:nameOf(gid)};
    const gs = stats(monthMs.filter(m=>m.game===gid));
    gotm = `<div class="gotm">${cover(g)}<div><span class="label">Juego del mes</span><h3>${esc(g.name)}</h3>
      <p class="num">${games[0][1]} ${games[0][1]===1?'partida':'partidas'} en ${monthName()}${gs[0]&&gs[0].w?` · domina ${esc(P(gs[0].id).name)} (${gs[0].w})`:''}</p></div></div>
      <div class="bars">${games.slice(0,4).map(([id,c])=>`<div class="bar"><span>${esc(nameOf(id))}</span><span class="num">${c}</span><div class="track"><div class="fill" style="width:${c/max*100}%"></div></div></div>`).join('')}</div>`;
  } else gotm = `<p class="hint">Aún no hay partidas en ${monthName()}.</p>`;

  return `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div class="title"><div><h1>Ranking</h1><p class="num">${ms.length} ${ms.length===1?'partida':'partidas'} ${ui.period==='mes'?'en '+monthName():'en total'}</p></div></div>
    <div class="seg glass" role="group" aria-label="Periodo">
      <button data-act="period" data-v="mes" aria-pressed="${ui.period==='mes'}">Este mes</button>
      <button data-act="period" data-v="all" aria-pressed="${ui.period==='all'}">Siempre</button>
    </div>
    ${rk.length ? `
    <section class="panel glass">
      <div class="podium">${top.map((r,i)=> r ? `
        <div class="pod p${[2,1,3][i]}">${av(P(r.id))}<span class="nm">${esc(P(r.id).name)}</span>
          <div class="block glass"><span class="pos">${[2,1,3][i]}º</span><b class="num">${r.w}</b><small>${r.w===1?'victoria':'victorias'}</small></div></div>` : '<div></div>').join('')}
      </div>
    </section>
    <section class="panel glass">
      <table>
        <thead><tr><th>Jugador</th><th>Victorias</th><th>Partidas</th><th>% gana</th></tr></thead>
        <tbody>${rk.map((r,i)=>`<tr><td><span class="who"><span class="pos">${i+1}</span>${av(P(r.id))}${esc(P(r.id).name)}</span></td><td class="w">${r.w}</td><td>${r.n}</td><td>${r.n?Math.round(r.w/r.n*100):0}%</td></tr>`).join('')}</tbody>
      </table>
    </section>` : `<div class="empty glass">Aún no hay partidas en este periodo.</div>`}
    <section class="panel glass">${gotm}</section>
    <div class="foot">
      <button class="link" data-act="change-me">Eres ${esc(me||'?')} · cambiar</button>
      <button class="link" data-act="logout">Cerrar sesión</button>
    </div>
  </div>`;
}

/* ---------- Ficha de juego ---------- */
function openSheet(id){
  const g = id ? G(id) : null;
  ui.sheet = g ? {...g, tags:[...g.tags], isNew:false, addingTag:false}
               : {id:null, name:'', tags:[], opt:2, max:4, owned:true, stars:0, author:me||'', cover:'', isNew:true, addingTag:false};
  renderSheet(); $('#sheet').classList.add('on'); $('#scrim').classList.add('on');
}
function closeSheet(){ $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); ui.sheet=null; }
function renderSheet(){
  const s = ui.sheet; if (!s) return;
  const n = s.id ? timesPlayed(s.id) : 0, lp = s.id ? lastPlayed(s.id) : null;
  $('#sheet').innerHTML = `
    <div class="grab" aria-hidden="true"></div>
    <div class="head">${cover({id:s.id||'nuevo', name:s.name||'?', cover:s.cover})}
      <div style="min-width:0"><span class="label">${s.isNew?'Nuevo juego':'Ficha del juego'}</span>
        <div class="facts" style="margin-top:6px">${s.isNew?'<span>Rellena lo que sepas, el resto luego.</span>':`<span><b class="num">${n}</b> ${n===1?'partida':'partidas'}</span><span>Última: <b>${lp?fmtDate(lp):'nunca'}</b></span>`}</div>
      </div>
    </div>
    <div class="field"><label class="label" for="s-name">Nombre</label><input class="input" id="s-name" value="${esc(s.name)}" placeholder="p. ej. Wingspan" autocomplete="off"></div>
    <div class="field"><span class="label">¿Os gusta?</span>
      <div class="bigstars" role="group" aria-label="Valoración">${[1,2,3,4,5].map(i=>`<button class="${i<=s.stars?'on':''}" data-act="s-star" data-v="${i}" aria-label="${i} estrellas">★</button>`).join('')}</div>
    </div>
    <div class="field"><span class="label">Etiquetas</span>
      <div class="chips wrap">${db.tags.map(t=>`<button class="chip" data-act="s-tag" data-v="${esc(t)}" aria-pressed="${s.tags.includes(t)}">${esc(t)}</button>`).join('')}
        ${s.addingTag ? `<span class="chip add"><input id="newtag" placeholder="Nueva etiqueta" maxlength="16" aria-label="Nueva etiqueta" enterkeyhint="done"></span>` : `<button class="chip add" data-act="s-addtag">+ Etiqueta</button>`}
      </div>
    </div>
    <div class="two">
      <div class="field"><span class="label">Óptimo</span><div class="stepper"><button data-act="s-step" data-k="opt" data-v="-1" aria-label="Menos">−</button><b class="num">${s.opt??'–'}</b><button data-act="s-step" data-k="opt" data-v="1" aria-label="Más">+</button></div></div>
      <div class="field"><span class="label">Máximo</span><div class="stepper"><button data-act="s-step" data-k="max" data-v="-1" aria-label="Menos">−</button><b class="num">${s.max??'–'}</b><button data-act="s-step" data-k="max" data-v="1" aria-label="Más">+</button></div></div>
    </div>
    <div class="field"><span class="label">¿Lo tenemos?</span>
      <div class="seg glass"><button data-act="s-owned" data-v="1" aria-pressed="${s.owned}">Sí, en casa</button><button data-act="s-owned" data-v="0" aria-pressed="${!s.owned}">Jugado fuera</button></div>
    </div>
    <div class="field"><label class="label" for="s-cover">Portada (enlace a imagen, opcional)</label><input class="input" id="s-cover" type="url" value="${esc(s.cover)}" placeholder="https://…" autocomplete="off" style="font-weight:500;font-size:14px"></div>
    <div class="field"><span class="label">Apuntado por</span>
      <div class="seg glass">${house().map(p=>`<button data-act="s-author" data-id="${esc(p.id)}" aria-pressed="${s.author===p.id}">${esc(p.name)}</button>`).join('')}<button data-act="s-author" data-id="Los dos" aria-pressed="${s.author==='Los dos'}">Los dos</button></div>
    </div>
    <div class="two"><button class="btn soft full" data-act="close-sheet">Cancelar</button><button class="btn ink full" data-act="s-save">Guardar</button></div>`;
}

/* ---------- render y eventos ---------- */
function render(){
  const gate = !pin || !me || !db.players.some(p=>p.id===me);
  $('.tabbar').hidden = gate;
  document.querySelectorAll('.tab').forEach(t=> t.setAttribute('aria-current', t.dataset.tab===ui.tab ? 'page' : 'false'));
  if (gate){ $('#view').innerHTML = viewLogin(); if (!pin) setTimeout(()=>$('#pin')?.focus(), 50); return; }
  if (!ui.draft) ui.draft = newDraft();
  $('#view').innerHTML = ui.tab==='ludo' ? viewLudo() : ui.tab==='partida' ? viewPartida() : viewRanking();
  if (ui.tab==='ludo') renderGrid();
  if (ui.tab==='partida') renderPicker();
}
let tt;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('on'),2600); }
const toggle = (arr,v) => arr.includes(v) ? arr.filter(x=>x!==v) : [...arr,v];

document.addEventListener('submit', async e=>{
  if (e.target.id!=='login-form') return;
  e.preventDefault();
  const typed = $('#pin').value.trim(); if (!typed) return;
  ui.busy = true; ui.loginErr = ''; render();
  try {
    accept(await api('read', {}, typed));
    pin = typed; store.set(LS.pin, pin); setSync('ok');
  } catch(err){
    ui.loginErr = err.message.includes('fetch') ? 'No hay conexión con Google. Revisa la implementación del script.' : err.message;
  }
  ui.busy = false; render();
});

document.addEventListener('click', e=>{
  const tab = e.target.closest('[data-tab]');
  if (tab){ ui.tab = tab.dataset.tab; ui.armed=null; render(); window.scrollTo({top:0}); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const {act, v, id, k} = el.dataset; const d = ui.draft, s = ui.sheet;
  switch(act){
    case 'pick-me': me = id; store.set(LS.me, me); ui.draft = null; render(); break;
    case 'change-me': me = null; store.del(LS.me); render(); break;
    case 'logout': store.del(LS.cache); db = {games:[],matches:[],players:[],tags:[]}; me=null; store.del(LS.me); logout(''); break;
    case 'f-owned': ui.f.owned=!ui.f.owned; el.setAttribute('aria-pressed',ui.f.owned); renderGrid(); break;
    case 'f-tag': ui.f.tag = ui.f.tag===v?null:v; document.querySelectorAll('[data-act="f-tag"]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.v===ui.f.tag)); renderGrid(); break;
    case 'f-n': ui.f.n=+v; document.querySelectorAll('[data-act="f-n"]').forEach(b=>b.setAttribute('aria-pressed', +b.dataset.v===ui.f.n)); renderGrid(); break;
    case 'open-game': openSheet(id); break;
    case 'new-game': openSheet(null); setTimeout(()=>$('#s-name')?.focus(),320); break;
    case 'close-sheet': closeSheet(); break;
    case 's-star': s.stars = s.stars===+v ? 0 : +v; renderSheet(); break;
    case 's-tag': s.tags = toggle(s.tags,v); renderSheet(); break;
    case 's-addtag': s.addingTag=true; renderSheet(); $('#newtag').focus(); break;
    case 's-step': { const cur = s[k] ?? (k==='opt'?2:4); s[k] = Math.min(20, Math.max(1, cur + +v)); if (k==='opt' && s.max!=null && s.opt>s.max) s.max=s.opt; if (k==='max' && s.opt!=null && s.max<s.opt) s.opt=s.max; renderSheet(); break; }
    case 's-owned': s.owned = v==='1'; renderSheet(); break;
    case 's-author': s.author = id; renderSheet(); break;
    case 's-save': {
      const name = clean(s.name); if (!name){ $('#s-name').focus(); toast('Ponle un nombre al juego'); return; }
      if (db.games.some(g=>g.id!==s.id && g.name.toLowerCase()===name.toLowerCase())){ toast(`Ya tenéis «${name}»`); return; }
      const {isNew, addingTag, ...g} = s; g.name = name; g.id = g.id || uid();
      if (isNew) db.games.push(g); else db.games[db.games.findIndex(x=>x.id===g.id)] = g;
      closeSheet(); render(); toast(isNew ? `${name} añadido a tus juegos` : 'Cambios guardados');
      sync('saveGame', {game:g}); break;
    }
    case 'd-game': d.game = d.game===id ? null : id; render(); break;
    case 'd-create': {
      const name = clean(d.q); if (!name) return;
      const g = {id:uid(), name, tags:[], opt:null, max:null, owned:false, stars:0, author:d.author, cover:''};
      db.games.push(g); d.game=g.id; d.q=''; render(); toast(`${name} creado · complétalo luego en Juegos`);
      sync('saveGame', {game:g}); break;
    }
    case 'd-player': d.players = toggle(d.players,id); d.winners = d.winners.filter(w=>d.players.includes(w)); render(); break;
    case 'add-friend': d.adding=true; render(); $('#friend').focus(); break;
    case 'd-win': d.winners = toggle(d.winners,id); render(); break;
    case 'd-author': d.author=id; render(); break;
    case 'save-match': {
      const m = {id:uid(), date:d.date, game:d.game, gameName:(G(d.game)||{}).name||'', players:[...d.players], winners:[...d.winners], author:d.author};
      db.matches.push(m);
      const msg = `Guardada · gana ${m.winners.map(w=>P(w).name).join(' y ')}`;
      ui.draft = newDraft(); render(); toast(msg);
      sync('saveMatch', {match:m}); break;
    }
    case 'del-match': {
      if (ui.armed !== id){ ui.armed = id; render(); return; }
      ui.armed = null; db.matches = db.matches.filter(m=>m.id!==id); render(); toast('Partida borrada');
      sync('deleteMatch', {id}); break;
    }
    case 'period': ui.period=v; render(); break;
  }
});
document.addEventListener('input', e=>{
  if (e.target.id==='q'){ ui.f.q = e.target.value; renderGrid(); }
  if (e.target.id==='pq'){ ui.draft.q = e.target.value; renderPicker(); }
  if (e.target.id==='d-date'){ ui.draft.date = e.target.value || iso(Date.now()); }
  if (e.target.id==='s-name' && ui.sheet){ ui.sheet.name = e.target.value; }
  if (e.target.id==='s-cover' && ui.sheet){ ui.sheet.cover = e.target.value.trim(); }
});
function addFriend(input){
  const name = clean(input.value); ui.draft.adding=false;
  if (!name){ render(); return; }
  const found = db.players.find(p=>p.name.toLowerCase()===name.toLowerCase());
  if (found){ if (!ui.draft.players.includes(found.id)) ui.draft.players.push(found.id); render(); return; }
  db.players.push({id:name, name, house:false}); ui.draft.players.push(name); render(); toast(`${name} se une a Ludi`);
  sync('addPlayer', {name});
}
function addTag(input){
  const t = clean(input.value); if (!t || !ui.sheet) return;
  if (!db.tags.includes(t)) db.tags.push(t);
  ui.sheet.tags = [...new Set([...ui.sheet.tags, t])]; ui.sheet.addingTag=false; renderSheet();
}
document.addEventListener('keydown', e=>{
  if (e.key==='Escape' && ui.sheet) closeSheet();
  if (e.key!=='Enter') return;
  if (e.target.id==='friend'){ e.preventDefault(); addFriend(e.target); }
  if (e.target.id==='newtag'){ e.preventDefault(); addTag(e.target); }
});
document.addEventListener('focusout', e=>{
  if (e.target.id==='friend' && ui.draft.adding){ const t=e.target; setTimeout(()=>{ if (ui.draft.adding) addFriend(t); },0); }
});
// Al volver a la app, trae lo que haya apuntado la otra persona
document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible') refresh(); });

render();
refresh();
