// Tiny table store: Airtable in production, local JSON in MOCK mode.
// Used by turnovers and the pre-arrival scheduler. Messages/escalations stay in airtable.js.

const fs = require('fs');
const path = require('path');

const MOCK = process.env.MOCK === 'true';
const DATA_DIR = path.join(__dirname, '..', 'data');

function localPath(table) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return path.join(DATA_DIR, `${table}.json`);
}

function readLocal(table) {
  const p = localPath(table);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
}

function writeLocal(table, rows) {
  fs.writeFileSync(localPath(table), JSON.stringify(rows, null, 2));
}

let base = null;
function getBase() {
  if (!base) {
    const Airtable = require('airtable');
    base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  }
  return base;
}

async function insert(table, fields) {
  if (MOCK) {
    const rows = readLocal(table);
    const row = { id: `${table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...fields };
    rows.push(row);
    writeLocal(table, rows);
    return row;
  }
  const created = await getBase()(table).create([{ fields }]);
  return { id: created[0].id, ...created[0].fields };
}

async function list(table, filter = () => true) {
  if (MOCK) return readLocal(table).filter(filter);
  const records = await getBase()(table).select().all();
  return records.map((r) => ({ id: r.id, ...r.fields })).filter(filter);
}

async function update(table, id, fields) {
  if (MOCK) {
    const rows = readLocal(table);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`${table}/${id} not found`);
    Object.assign(row, fields);
    writeLocal(table, rows);
    return row;
  }
  const updated = await getBase()(table).update([{ id, fields }]);
  return { id: updated[0].id, ...updated[0].fields };
}

module.exports = { insert, list, update };
