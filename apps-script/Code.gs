/**
 * Ludi · puente entre la app y Google Sheets.
 *
 * Instalación (una sola vez):
 *  1. En el Google Sheet "Ludi": Extensiones > Apps Script. Pega este archivo entero en Code.gs.
 *  2. Configuración del proyecto (rueda dentada) > Propiedades del script > añade:
 *       PIN = el código de casa que elijáis (mejor 6 cifras o más)
 *     Si el script NO se creó desde el Sheet, añade también:
 *       SHEET_ID = el trozo de la URL del Sheet entre /d/ y /edit
 *  3. Implementar > Gestionar implementaciones > editar (lápiz) > Versión: Nueva versión > Implementar.
 *     Tipo "Aplicación web", Ejecutar como "Yo", Acceso "Cualquier usuario".
 *
 * Las pestañas Juegos, Partidas y Jugadores se crean solas la primera vez.
 */

const SHEETS = {
  Juegos:    ['id', 'nombre', 'etiquetas', 'optimo', 'maximo', 'enCasa', 'estrellas', 'autor', 'portada', 'creado'],
  Partidas:  ['id', 'fecha', 'juegoId', 'juego', 'jugadores', 'ganadores', 'autor', 'creado'],
  Jugadores: ['nombre', 'casa', 'creado'],
};

const DEFAULT_TAGS = ['Estrategia', 'Rápido', 'Ágil', 'Colaborativo', 'De viaje', 'Party', 'Cartas', 'Dúo'];

const SEED_PLAYERS = [['Marta', true], ['Nacho', true]];

// id, nombre, etiquetas, óptimo, máximo, en casa
const SEED_GAMES = [
  ['rebel-princess',    'Rebel Princess',    'Cartas, Party',                          5, 6, true],
  ['the-mind',          'The Mind',          'Colaborativo, Cartas, Rápido, De viaje', 3, 4, true],
  ['catan',             'Catan',             'Estrategia',                             4, 4, true],
  ['domino',            'Dominó',            'Rápido, De viaje',                       4, 4, true],
  ['oceanos-de-papel',  'Océanos de Papel',  'Cartas, Rápido, De viaje',               3, 4, true],
  ['codigo-secreto',    'Código Secreto',    'Party',                                  6, 8, true],
  ['que-nota-te-pones', 'Qué nota te pones', '',                                       '', '', true],
  ['cubirds',           'Cubirds',           'Cartas, Rápido',                         3, 5, true],
  ['optimus-ii',        'Optimus II',        '',                                       '', '', true],
  ['ito',               'Ito',               'Colaborativo, Party',                    6, 10, true],
  ['the-gang',          'The Gang',          'Colaborativo, Cartas',                   4, 6, false],
  ['terraforming-mars', 'Terraforming Mars', 'Estrategia',                             3, 5, false],
  ['no-gracias',        '¡No Gracias!',      'Cartas, Rápido, Party',                  5, 7, false],
  ['toma-6',            'Toma 6',            'Cartas, Rápido, Party',                  5, 10, false],
  ['rummikub',          'Rummikub',          'Estrategia',                             4, 4, false],
];

/* ---------------- entrada ---------------- */

// El PIN viaja siempre en el cuerpo de un POST, nunca en la URL.
function doGet() {
  return respond(() => 'Ludi está funcionando');
}

function doPost(e) {
  return respond(() => {
    const body = JSON.parse(e.postData.contents);
    checkPin(body.pin);
    if (body.action === 'read') return readAll();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      switch (body.action) {
        case 'saveGame':    saveGame(body.game); break;
        case 'saveMatch':   saveMatch(body.match); break;
        case 'deleteMatch': deleteRow('Partidas', body.id); break;
        case 'addPlayer':   addPlayer(body.name); break;
        default: throw new Error('Acción desconocida: ' + body.action);
      }
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return readAll();
  });
}

function respond(fn) {
  let out;
  try {
    out = { ok: true, data: fn() };
  } catch (err) {
    out = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- PIN ---------------- */

function checkPin(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pinFails') || 0);
  if (fails >= 20) throw new Error('Demasiados intentos. Espera 10 minutos.');
  const real = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!real) throw new Error('Falta configurar el PIN en las propiedades del script.');
  if (String(pin || '') !== real) {
    cache.put('pinFails', String(fails + 1), 600);
    throw new Error('PIN incorrecto');
  }
}

/* ---------------- hojas ---------------- */

function book() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('No encuentro el Sheet: añade SHEET_ID en las propiedades del script.');
  return SpreadsheetApp.openById(id);
}

function sheet(name) {
  const ss = book();
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name);
  const head = SHEETS[name];
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const now = new Date();
  if (name === 'Jugadores') {
    sh.getRange(2, 1, SEED_PLAYERS.length, 3).setValues(SEED_PLAYERS.map(p => [p[0], p[1], now]));
  }
  if (name === 'Juegos') {
    sh.getRange(2, 1, SEED_GAMES.length, head.length)
      .setValues(SEED_GAMES.map(g => [g[0], g[1], g[2], g[3], g[4], g[5], 0, 'Los dos', '', now]));
  }
  // la hoja por defecto vacía sobra
  const blank = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  return sh;
}

/** Ejecútala a mano desde el editor si quieres crear las pestañas sin abrir la app. */
function inicializar() {
  Object.keys(SHEETS).forEach(sheet);
}

function rows(name) {
  const sh = sheet(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const head = SHEETS[name];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, last - 1, head.length).getValues()
    .filter(r => r[0] !== '')
    .map(r => {
      const o = {};
      head.forEach((h, i) => {
        const v = r[i];
        o[h] = v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
      });
      return o;
    });
}

const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const bool = v => v === true || String(v).toUpperCase() === 'TRUE';
const num  = v => (v === '' || v === null || isNaN(Number(v))) ? null : Number(v);
const clean = s => String(s || '').replace(/,/g, ' ').trim();

function readAll() {
  const games = rows('Juegos').map(r => ({
    id: String(r.id), name: String(r.nombre), tags: list(r.etiquetas),
    opt: num(r.optimo), max: num(r.maximo), owned: bool(r.enCasa),
    stars: num(r.estrellas) || 0, author: String(r.autor || ''), cover: String(r.portada || ''),
  }));
  const matches = rows('Partidas').map(r => ({
    id: String(r.id), date: String(r.fecha), game: String(r.juegoId), gameName: String(r.juego),
    players: list(r.jugadores), winners: list(r.ganadores), author: String(r.autor || ''),
  }));
  const players = rows('Jugadores').map(r => ({ id: String(r.nombre), name: String(r.nombre), house: bool(r.casa) }));
  // quien aparece en partidas pero no está en Jugadores también cuenta
  matches.forEach(m => m.players.forEach(n => {
    if (!players.some(p => p.id === n)) players.push({ id: n, name: n, house: false });
  }));
  const tags = DEFAULT_TAGS.slice();
  games.forEach(g => g.tags.forEach(t => { if (!tags.includes(t)) tags.push(t); }));
  return { games, matches, players, tags };
}

function findRow(name, id) {
  const sh = sheet(name);
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(id));
  return i < 0 ? -1 : i + 2;
}

function newId() {
  return Utilities.getUuid().slice(0, 8);
}

/* ---------------- acciones ---------------- */

function saveGame(g) {
  const name = clean(g && g.name);
  if (!name) throw new Error('El juego necesita un nombre');
  const id = g.id || newId();
  const sh = sheet('Juegos');
  const at = g.id ? findRow('Juegos', g.id) : -1;
  const created = at > 0 ? sh.getRange(at, 10).getValue() : new Date();
  const row = [id, name, (g.tags || []).map(clean).join(', '), g.opt || '', g.max || '',
               !!g.owned, Number(g.stars) || 0, clean(g.author), String(g.cover || ''), created];
  if (at > 0) sh.getRange(at, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function saveMatch(m) {
  if (!m || !m.game) throw new Error('Falta el juego');
  if (!m.players || !m.players.length) throw new Error('Falta quién juega');
  if (!m.winners || !m.winners.length) throw new Error('Falta quién gana');
  const g = rows('Juegos').find(r => String(r.id) === String(m.game));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet('Partidas').appendRow([
    clean(m.id) || newId(), date, m.game, g ? g.nombre : '',
    m.players.map(clean).join(', '), m.winners.map(clean).join(', '), clean(m.author), new Date(),
  ]);
}

function addPlayer(name) {
  const n = clean(name);
  if (!n) throw new Error('Falta el nombre');
  if (rows('Jugadores').some(r => String(r.nombre).toLowerCase() === n.toLowerCase())) return;
  sheet('Jugadores').appendRow([n, false, new Date()]);
}

function deleteRow(name, id) {
  const at = findRow(name, id);
  if (at > 0) sheet(name).deleteRow(at);
}
