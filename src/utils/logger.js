const LEVELS = ['error', 'warn', 'info', 'debug'];
let activeLevel = process.env.LOG_LEVEL && LEVELS.includes(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : 'warn';
const format = (process.env.LOG_FORMAT || 'pretty').toLowerCase();

function levelIndex(level) { return LEVELS.indexOf(level); }
function shouldLog(level) { return levelIndex(level) <= levelIndex(activeLevel); }

function flattenMeta(meta, prefix = '') {
  const out = {};
  if (!meta || typeof meta !== 'object') return out;
  for (const k of Object.keys(meta)) {
    const v = meta[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flattenMeta(v, key)); else out[key] = v;
  }
  return out;
}

function write(level, msg, meta) {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  const base = { ts, level, msg };
  const m = meta ? flattenMeta(meta) : undefined;
  if (format === 'json') {
    const line = JSON.stringify(m ? { ...base, ...m } : base);
    if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
    return;
  }
  const lvl = level.toUpperCase().padEnd(5);
  const scope = m && m.scope ? ` [${m.scope}]` : '';
  const restKeys = m ? Object.keys(m).filter(k => k !== 'scope') : [];
  const rest = restKeys.length ? ' ' + restKeys.map(k => `${k}=${m[k]}`).join(' ') : '';
  const line = `${ts} ${lvl}${scope} ${msg}${rest}`;
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

function makeLogger(defaultMeta = {}) {
  return {
    info: (msg, meta) => write('info', msg, { ...defaultMeta, ...(meta || {}) }),
    warn: (msg, meta) => write('warn', msg, { ...defaultMeta, ...(meta || {}) }),
    error: (msg, meta) => write('error', msg, { ...defaultMeta, ...(meta || {}) }),
    debug: (msg, meta) => write('debug', msg, { ...defaultMeta, ...(meta || {}) }),
    child: (meta) => makeLogger({ ...defaultMeta, ...(meta || {}) }),
    setLevel: (lvl) => { if (LEVELS.includes(lvl)) activeLevel = lvl; }
  };
}

module.exports = makeLogger();
