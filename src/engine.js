import {
  BAG,
  CLEAR_BURST,
  CLEAR_FALL,
  CLEAR_LAND,
  COLS,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  ORES,
  PICKAXES,
  ROWS,
  SHAPES,
  SITES,
  axeById,
  gravityForSpent,
  durabilitySpent,
  kicksFor,
  siteById,
} from "./data.js";

const SAVE_KEY = "tetris-mine-save-v2";

export function emptyRow() {
  return Array(COLS).fill(null);
}

export function emptyBoard() {
  return Array.from({ length: ROWS }, emptyRow);
}

function emptyAxes() {
  return Object.fromEntries(
    PICKAXES.filter((axe) => axe.id !== "simple").map((axe) => [axe.id, 0]),
  );
}

export function createProgress(saved) {
  const progress = {
    axes: emptyAxes(),
    ore: Object.fromEntries(ORES.map((item) => [item.id, 0])),
    found: [],
    bestScore: 0,
    mined: 0,
    sound: true,
    played: [],
    had: [],
    equipped: "simple",
    unlocked: ["quarry"],
  };
  if (!saved || typeof saved !== "object") {
    progress.played = ["quarry"];
    return progress;
  }
  if (saved.axes && typeof saved.axes === "object") {
    for (const id of Object.keys(progress.axes)) {
      const value = Number(saved.axes[id]);
      if (Number.isFinite(value) && value >= 0) progress.axes[id] = Math.floor(value);
    }
    if (progress.axes.bronze === 0 && Number(saved.axes.tin) > 0) {
      progress.axes.bronze = Math.floor(Number(saved.axes.tin));
    }
  }
  if (saved.ore && typeof saved.ore === "object") {
    for (const item of ORES) {
      const value = Number(saved.ore[item.id]);
      if (Number.isFinite(value) && value >= 0) progress.ore[item.id] = Math.floor(value);
    }
  }
  const found = new Set();
  if (Array.isArray(saved.found)) {
    for (const id of saved.found) {
      if (typeof id === "string" && ORES.some((ore) => ore.id === id)) found.add(id);
    }
  }
  for (const item of ORES) {
    if (progress.ore[item.id] > 0) found.add(item.id);
  }
  progress.found = [...found];
  if (Number.isFinite(saved.bestScore) && saved.bestScore > 0) {
    progress.bestScore = Math.floor(saved.bestScore);
  }
  if (Number.isFinite(saved.mined) && saved.mined > 0) progress.mined = Math.floor(saved.mined);
  if (typeof saved.sound === "boolean") progress.sound = saved.sound;
  if (Array.isArray(saved.unlocked)) {
    const ids = saved.unlocked.filter((id) => typeof id === "string" && siteById(id) && id !== "quarry");
    progress.unlocked = ["quarry", ...ids];
  } else {
    progress.unlocked = legacyReachable(progress);
  }
  if (Array.isArray(saved.played)) {
    progress.played = saved.played.filter((id) => typeof id === "string" && siteById(id));
  } else {
    progress.played = openSites(progress).map((site) => site.id);
  }
  if (typeof saved.equipped === "string" && axeById(saved.equipped)) {
    progress.equipped = saved.equipped;
  } else {
    progress.equipped = strongestHeld(progress);
  }
  const had = new Set();
  if (Array.isArray(saved.had)) {
    for (const id of saved.had) {
      if (typeof id === "string" && Object.hasOwn(progress.axes, id)) had.add(id);
    }
  }
  for (const [id, count] of Object.entries(progress.axes)) {
    if (count > 0) had.add(id);
  }
  progress.had = [...had];
  return progress;
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return createProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return createProgress(null);
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // Private mode and full disks should not stop the shift.
  }
}

export function ticketsHeld(progress, axeId) {
  if (axeId === "simple") return Infinity;
  return progress.axes[axeId] ?? 0;
}

export function oreFound(progress, oreId) {
  if ((progress.found ?? []).includes(oreId)) return true;
  return (progress.ore[oreId] ?? 0) > 0;
}

export function noteOreFound(progress, oreId) {
  if (!ORES.some((ore) => ore.id === oreId)) return;
  if (!Array.isArray(progress.found)) progress.found = [];
  if (!progress.found.includes(oreId)) progress.found.push(oreId);
}

export function axeFound(progress, axeId) {
  if (axeId === "simple") return true;
  if ((progress.had ?? []).includes(axeId)) return true;
  return ticketsHeld(progress, axeId) >= 1;
}

/** Known unlock costs are all affordable (unknown ores ignored). */
export function knownUnlockReady(progress, siteId) {
  const site = siteById(siteId);
  if (!site?.cost || isUnlocked(progress, siteId)) return false;
  const known = Object.entries(site.cost).filter(([id]) => oreFound(progress, id));
  if (known.length === 0) return false;
  return known.every(([id, need]) => progress.ore[id] >= need);
}

/** Known forge costs are all affordable (unknown ores/axes ignored). */
export function knownForgeReady(progress, axeId) {
  const axe = axeById(axeId);
  if (!axe?.cost) return false;
  const knownOre = Object.entries(axe.cost).filter(([id]) => oreFound(progress, id));
  const knownAxe = Object.entries(axe.spendAxes ?? {}).filter(([id]) => axeFound(progress, id));
  if (knownOre.length === 0 && knownAxe.length === 0) return false;
  if (!knownOre.every(([id, need]) => progress.ore[id] >= need)) return false;
  return knownAxe.every(([id, need]) => ticketsHeld(progress, id) >= need);
}

function legacyCanEnter(progress, site) {
  if (site.tickets.includes("simple")) return true;
  const primary = axeById(site.tickets[0]);
  const vein = new Set(Object.keys(primary.drops));
  const primaryStrong = new Set(primary.wildcards.filter((id) => vein.has(id)));
  const primaryIndex = PICKAXES.findIndex((axe) => axe.id === primary.id);
  for (const axe of PICKAXES) {
    if (ticketsHeld(progress, axe.id) < 1) continue;
    if (site.tickets.includes(axe.id)) return true;
    const index = PICKAXES.findIndex((item) => item.id === axe.id);
    if (index < primaryIndex) continue;
    const strong = new Set(axe.wildcards.filter((id) => vein.has(id)));
    const covers = [...primaryStrong].every((id) => strong.has(id));
    const extra = [...strong].some((id) => !primaryStrong.has(id));
    if (covers && extra) return true;
  }
  return false;
}

function legacyReachable(progress) {
  return SITES.filter((site) => legacyCanEnter(progress, site)).map((site) => site.id);
}

function strongestHeld(progress) {
  for (let index = PICKAXES.length - 1; index >= 0; index -= 1) {
    const id = PICKAXES[index].id;
    if (id !== "simple" && ticketsHeld(progress, id) >= 1) return id;
  }
  return "simple";
}

export function isUnlocked(progress, siteId) {
  if (siteId === "quarry") return true;
  return (progress.unlocked ?? []).includes(siteId);
}

export function canPayUnlock(progress, siteId) {
  const site = siteById(siteId);
  if (!site?.cost || isUnlocked(progress, siteId)) return false;
  return Object.entries(site.cost).every(([id, need]) => progress.ore[id] >= need);
}

export function unlockSite(progress, siteId) {
  if (!canPayUnlock(progress, siteId)) return false;
  const site = siteById(siteId);
  for (const [id, need] of Object.entries(site.cost)) progress.ore[id] -= need;
  progress.unlocked.push(site.id);
  saveProgress(progress);
  return true;
}

export function equip(progress, axeId) {
  if (!axeById(axeId) || ticketsHeld(progress, axeId) < 1) return false;
  progress.equipped = axeId;
  saveProgress(progress);
  return true;
}

export function canEnter(progress, siteId) {
  if (!isUnlocked(progress, siteId)) return false;
  return ticketsHeld(progress, progress.equipped || "simple") >= 1;
}

export function openSites(progress) {
  return SITES.filter((site) => isUnlocked(progress, site.id));
}

export function enterSite(progress, siteId) {
  if (!canEnter(progress, siteId)) return null;
  const site = siteById(siteId);
  const ticket = progress.equipped || "simple";
  if (ticket !== "simple") progress.axes[ticket] -= 1;
  if (!progress.played.includes(site.id)) progress.played.push(site.id);
  saveProgress(progress);
  return { ...site, ticket };
}

export function canForge(progress, axeId) {
  const axe = axeById(axeId);
  if (!axe?.cost) return false;
  if (!Object.entries(axe.cost).every(([id, need]) => progress.ore[id] >= need)) return false;
  return Object.entries(axe.spendAxes ?? {}).every(([id, need]) => ticketsHeld(progress, id) >= need);
}

export function forge(progress, axeId) {
  if (!canForge(progress, axeId)) return false;
  const axe = axeById(axeId);
  for (const [id, need] of Object.entries(axe.cost)) progress.ore[id] -= need;
  for (const [id, need] of Object.entries(axe.spendAxes ?? {})) progress.axes[id] -= need;
  progress.axes[axeId] += 1;
  if (!Array.isArray(progress.had)) progress.had = [];
  if (!progress.had.includes(axeId)) progress.had.push(axeId);
  saveProgress(progress);
  return true;
}

export function rollOre(drops, rng) {
  let roll = rng() * 100;
  const entries = Object.entries(drops);
  for (const [id, weight] of entries) {
    roll -= weight;
    if (roll < 0) return id;
  }
  return entries[entries.length - 1][0];
}

export function orientedCells(type, ores, rotation) {
  const shape = SHAPES[type];
  const cells = shape.cells.map(([x, y], index) => ({ x, y, ore: ores[index] }));
  const [px, py] = shape.pivot;
    for (let turn = 0; turn < rotation; turn += 1) {
      for (const cell of cells) {
        const x = px + (py - cell.y);
        const y = py + (cell.x - px);
        cell.x = Math.round(x);
        cell.y = Math.round(y);
      }
    }
  return cells;
}

export function worldCells(piece) {
  return orientedCells(piece.type, piece.ores, piece.r).map((cell) => ({
    x: cell.x + piece.x,
    y: cell.y + piece.y,
    ore: cell.ore,
  }));
}

export function collides(board, cells) {
  return cells.some((cell) => {
    if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return true;
    if (cell.y < 0) return false;
    return Boolean(board[cell.y][cell.x]);
  });
}

function pullType(state) {
  if (state.bag.length === 0) {
    state.bag = BAG.slice();
    for (let i = state.bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(state.rng() * (i + 1));
      [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
    }
  }
  return state.bag.pop();
}

function makePiece(state) {
  const axe = axeById(state.ticket);
  const drops = state.drops ?? axe.drops;
  const ores = [0, 1, 2, 3].map(() => rollOre(drops, state.rng));
  return { type: pullType(state), ores, r: 0, x: 3, y: 0 };
}

function ensureQueue(state) {
  while (state.queue.length < 1) state.queue.push(makePiece(state));
}

export function createState(progress, ticket, rng = Math.random, drops = null) {
  const axe = axeById(ticket);
  const durability = axe?.durability ?? 1;
  const state = {
    progress,
    ticket,
    drops,
    rng,
    board: emptyBoard(),
    queue: [],
    bag: [],
    piece: null,
    runResources: 0,
    runOre: {},
    durabilityMax: durability,
    durabilityLeft: durability,
    status: "ready",
    fallAcc: 0,
    lockAcc: 0,
    lockResets: 0,
    clearLeft: 0,
    clearDuration: 0,
    clearPhase: null,
    clearCells: [],
    clearGone: [],
    clearPlan: [],
    clearStep: 0,
    clearWave: 0,
    falls: [],
    buffer: null,
  };
  ensureQueue(state);
  return state;
}

export function ghostY(state) {
  if (!state.piece) return null;
  let y = state.piece.y;
  const probe = { ...state.piece };
  while (true) {
    probe.y = y + 1;
    if (collides(state.board, worldCells(probe))) return y;
    y += 1;
  }
}

function canMove(state, dx, dy, rotation = state.piece.r) {
  const probe = { ...state.piece, r: rotation, x: state.piece.x + dx, y: state.piece.y + dy };
  return !collides(state.board, worldCells(probe));
}

function noteShift(state) {
  if (!state.piece) return;
  if (canMove(state, 0, 1)) return;
  if (state.lockResets < MAX_LOCK_RESETS) {
    state.lockAcc = 0;
    state.lockResets += 1;
  }
}

export function tryMove(state, dx, dy, options = {}) {
  if (state.status !== "playing" || !state.piece || state.clearLeft > 0) return false;
  if (!canMove(state, dx, dy)) return false;
  state.piece.x += dx;
  state.piece.y += dy;
  if (dy === 0) noteShift(state);
  if (dy > 0 && !options.fall) state.fallAcc = 0;
  return true;
}

export function tryRotate(state, dir) {
  if (state.status !== "playing" || !state.piece || state.clearLeft > 0) return false;
  const from = state.piece.r;
  const to = (from + dir + 4) % 4;
  const kicks = kicksFor(state.piece.type, from, to);
  for (const [kx, ky] of kicks) {
    const probe = {
      ...state.piece,
      r: to,
      x: state.piece.x + kx,
      y: state.piece.y + ky,
    };
    if (!collides(state.board, worldCells(probe))) {
      state.piece.r = to;
      state.piece.x = probe.x;
      state.piece.y = probe.y;
      noteShift(state);
      return true;
    }
  }
  return false;
}

export function mineFullRows(board, wildcards = []) {
  const wild = new Set(wildcards);
  const next = board.map((row) => row.slice());
  const targets = [];
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (next[y].every(Boolean)) targets.push(y);
  }
  if (targets.length === 0) return { board, mined: [], moves: [], rows: [] };

  const mined = [];
  const rows = [];
  for (const y of targets) {
    const row = next[y];
    const clearAll = row.every((cell) => !wild.has(cell));
    const cells = [];
    for (let x = 0; x < COLS; x += 1) {
      if (clearAll || wild.has(row[x])) {
        const cell = { x, y, ore: row[x] };
        cells.push(cell);
        mined.push(cell);
        row[x] = null;
      }
    }
    rows.push({ y, clearAll, mined: cells });
  }
  const floor = targets[0];
  const moves = fallAbove(next, floor);
  if (next[floor].every((cell) => cell === null)) {
    const kept = next.filter((_, y) => y !== floor);
    kept.unshift(emptyRow());
    for (let y = 0; y < ROWS; y += 1) next[y] = kept[y];
  }
  return { board: next, mined, moves, rows };
}

function payableCounts(mined, clearAll) {
  const counts = new Map();
  for (const cell of mined) counts.set(cell.ore, (counts.get(cell.ore) ?? 0) + 1);
  if (!clearAll || counts.size < 2) return counts;
  let best = 0;
  let leaders = 0;
  for (const count of counts.values()) {
    if (count > best) {
      best = count;
      leaders = 1;
    } else if (count === best) leaders += 1;
  }
  if (leaders !== 1) return new Map();
  const paid = new Map();
  for (const [ore, count] of counts) {
    if (count === best) paid.set(ore, count);
  }
  return paid;
}

function fallAbove(board, floor) {
  const moves = [];
  for (let x = 0; x < COLS; x += 1) {
    const falling = [];
    for (let y = 0; y <= floor; y += 1) {
      if (board[y][x]) falling.push({ y, ore: board[y][x] });
      board[y][x] = null;
    }
    for (let i = 0; i < falling.length; i += 1) {
      const block = falling[falling.length - 1 - i];
      const to = floor - i;
      board[to][x] = block.ore;
      if (to !== block.y) moves.push({ x, from: block.y, to, ore: block.ore });
    }
  }
  return moves;
}

function planFrom(mined) {
  const byRow = new Map();
  for (const cell of mined) {
    const row = byRow.get(cell.y) ?? [];
    row.push(cell);
    byRow.set(cell.y, row);
  }
  return [...byRow.keys()].sort((a, b) => b - a).map((y) => byRow.get(y));
}

function queueWave(state) {
  const { mined } = mineFullRows(state.board, axeById(state.ticket).wildcards);
  if (mined.length === 0) return false;
  state.clearPlan = planFrom(mined);
  state.clearStep = 0;
  return true;
}

function armBurst(state) {
  const cells = state.clearPlan.flat();
  state.clearPhase = "burst";
  state.clearCells = cells.map((cell) => `${cell.x},${cell.y}`);
  state.clearLeft = CLEAR_BURST;
  state.clearDuration = CLEAR_BURST;
  return {
    type: "burst",
    cells,
    rows: state.clearPlan.map((row) => row[0].y),
    chain: state.clearWave,
  };
}

function stuckRows() {
  return [];
}

function payout(state, count) {
  const axe = axeById(state.ticket);
  let total = 0;
  let doubled = 0;
  for (let i = 0; i < count; i += 1) {
    let amount = axe.yield;
    if (axe.doubleChance > 0 && state.rng() < axe.doubleChance) {
      amount *= 2;
      doubled += 1;
    }
    total += amount;
  }
  return { total, doubled };
}

function spawn(state) {
  ensureQueue(state);
  state.piece = state.queue.shift();
  ensureQueue(state);
  state.fallAcc = 0;
  state.lockAcc = 0;
  state.lockResets = 0;
  if (collides(state.board, worldCells(state.piece))) {
    state.piece = null;
    state.status = "over";
    saveProgress(state.progress);
    return [{ type: "over" }];
  }
  return [];
}

function settleMine(state) {
  const axe = axeById(state.ticket);
  const { board, mined, moves, rows } = mineFullRows(state.board, axe.wildcards);
  if (mined.length === 0) return null;
  state.board = board;
  state.falls = moves;
  const groups = new Map();
  for (const row of rows) {
    const cells = axe.id === "simple" ? row.mined.filter((cell) => cell.ore === "stone") : row.mined;
    const counts = payableCounts(cells, axe.id === "simple" ? false : row.clearAll);
    for (const [ore, count] of counts) {
      const pay = payout(state, count);
      state.progress.ore[ore] += pay.total;
      noteOreFound(state.progress, ore);
      state.runOre[ore] = (state.runOre[ore] ?? 0) + pay.total;
      state.progress.mined += count;
      const group = groups.get(ore) ?? { ore, amount: 0, doubled: 0, rows: 0 };
      group.amount += pay.total;
      group.doubled += pay.doubled;
      group.rows += count;
      groups.set(ore, group);
    }
  }
  for (const group of groups.values()) state.runResources += group.amount;
  const strong = new Set(axe.wildcards);
  const yieldedStrong = [...groups.keys()].some((ore) => strong.has(ore));
  const drain = yieldedStrong ? 1 : 2;
  state.durabilityLeft = Math.max(0, (state.durabilityLeft ?? 0) - drain);
  saveProgress(state.progress);
  return {
    type: "mine",
    lines: rows.length,
    perfect: false,
    rows: rows.map((row) => row.y),
    groups: [...groups.values()],
  };
}

export function resolveClear(state) {
  const events = [];
  state.clearCells = [];
  state.clearGone = [];
  state.clearPlan = [];
  state.clearPhase = null;
  state.clearLeft = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const event = settleMine(state);
    if (!event) break;
    events.push(event);
  }
  if (events.length === 0) return events;
  const perfect = state.board.every((row) => row.every((cell) => cell === null));
  if (perfect) {
    events.at(-1).perfect = true;
    events.push({ type: "perfect" });
  }
  saveProgress(state.progress);
  return events;
}

function lockPiece(state) {
  const events = [];
  const cells = worldCells(state.piece);
  if (cells.some((cell) => cell.y < 0)) {
    state.piece = null;
    state.status = "over";
    saveProgress(state.progress);
    events.push({ type: "over" });
    return events;
  }

  const wildcards = axeById(state.ticket).wildcards;
  const beforeStuck = new Set(stuckRows(state.board, wildcards));
  for (const cell of cells) state.board[cell.y][cell.x] = cell.ore;
  state.piece = null;
  events.push({ type: "locked", cells: cells.map((cell) => ({ x: cell.x, y: cell.y })) });

  const fresh = stuckRows(state.board, wildcards).filter((y) => !beforeStuck.has(y));
  if (fresh.length > 0) events.push({ type: "mixed", rows: fresh });

  const pending = mineFullRows(state.board, wildcards).mined;
  if (pending.length > 0) {
    state.clearWave = 0;
    state.clearGone = [];
    queueWave(state);
    events.push(armBurst(state));
    return events;
  }
  events.push(...spawn(state));
  return events;
}

export function hardDrop(state) {
  if (state.status !== "playing" || !state.piece || state.clearLeft > 0) return [];
  while (tryMove(state, 0, 1, { fall: true }));
  return lockPiece(state);
}

export function queueAction(state, action) {
  if (state.clearLeft > 0 && state.status === "playing") {
    if (action === "left" || action === "right" || action === "cw" || action === "ccw") {
      state.buffer = action;
    }
    return { accepted: false, events: [] };
  }
  if (action === "left") return { accepted: tryMove(state, -1, 0), events: [] };
  if (action === "right") return { accepted: tryMove(state, 1, 0), events: [] };
  if (action === "cw") return { accepted: tryRotate(state, 1), events: [] };
  if (action === "ccw") return { accepted: tryRotate(state, -1), events: [] };
  if (action === "hard") return { accepted: true, events: hardDrop(state) };
  if (action === "soft") return { accepted: tryMove(state, 0, 1), events: [] };
  return { accepted: false, events: [] };
}

function applyBuffer(state) {
  const action = state.buffer;
  state.buffer = null;
  if (!action || state.status !== "playing") return [];
  return queueAction(state, action).events;
}

export function startShift(state) {
  if (state.status === "playing") return;
  const fresh = state.status === "over";
  state.board = emptyBoard();
  state.piece = null;
  state.runResources = 0;
  state.runOre = {};
  state.fallAcc = 0;
  state.lockAcc = 0;
  state.lockResets = 0;
  state.clearLeft = 0;
  state.clearDuration = 0;
  state.clearPhase = null;
  state.clearCells = [];
  state.clearGone = [];
  state.clearPlan = [];
  state.clearStep = 0;
  state.clearWave = 0;
  state.falls = [];
  state.buffer = null;
  if (fresh) {
    state.queue = [];
    state.bag = [];
  }
  state.status = "playing";
  ensureQueue(state);
  spawn(state);
}

export function resetProgress(progress) {
  const sound = progress.sound;
  const fresh = createProgress(null);
  progress.axes = fresh.axes;
  progress.ore = fresh.ore;
  progress.found = fresh.found;
  progress.bestScore = 0;
  progress.mined = 0;
  progress.sound = sound;
  progress.played = fresh.played;
  progress.had = fresh.had;
  progress.equipped = fresh.equipped;
  progress.unlocked = fresh.unlocked;
  saveProgress(progress);
}

function finishClear(state, events) {
  if (queueWave(state)) {
    state.clearWave += 1;
    events.push(armBurst(state));
    return events;
  }
  state.clearPhase = null;
  state.clearDuration = 0;
  state.falls = [];
  if (state.status === "playing") events.push(...spawn(state));
  events.push(...applyBuffer(state));
  return events;
}

export function tick(state, dt) {
  const events = [];
  if (state.status !== "playing") return events;
  if (state.clearLeft > 0) {
    state.clearLeft -= dt;
    if (state.clearLeft > 0) return events;
    state.clearLeft = 0;
    if (state.clearPhase === "burst") {
      const mined = settleMine(state);
      if (mined) {
        const perfect = state.board.every((row) => row.every((cell) => cell === null));
        if (perfect) mined.perfect = true;
        events.push(mined);
        if (perfect) events.push({ type: "perfect" });
      }
      state.clearCells = [];
      state.clearGone = [];
      state.clearPlan = [];
      if (state.falls.length > 0) {
        state.clearPhase = "fall";
        state.clearLeft = CLEAR_FALL;
        state.clearDuration = CLEAR_FALL;
        return events;
      }
      return finishClear(state, events);
    }
    if (state.clearPhase === "fall") {
      state.falls = [];
      state.clearPhase = "land";
      state.clearLeft = CLEAR_LAND;
      state.clearDuration = CLEAR_LAND;
      return events;
    }
    if (state.clearPhase === "land") return finishClear(state, events);
  }
  if (!state.piece) return events;

  const grounded = !canMove(state, 0, 1);
  if (!grounded) {
    state.lockAcc = 0;
    state.fallAcc += dt;
    const gravity = gravityForSpent(durabilitySpent(state));
    while (state.fallAcc >= gravity) {
      state.fallAcc -= gravity;
      if (!tryMove(state, 0, 1, { fall: true })) break;
    }
  } else {
    state.fallAcc = 0;
    state.lockAcc += dt;
    if (state.lockAcc >= LOCK_DELAY) events.push(...lockPiece(state));
  }
  return events;
}
