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
  isAxeId,
  isOreId,
  isSiteId,
  kicksFor,
  siteById,
} from "./data";
import type {
  AxeId,
  CraftedAxeId,
  Drops,
  OreId,
  PieceType,
  Rotation,
  Site,
  SiteId,
} from "./data";

export type Cell = OreId | null;
export type Board = Cell[][];
export type Rng = () => number;
export type Action = "left" | "right" | "cw" | "ccw" | "hard" | "soft";
export type BufferedAction = "left" | "right" | "cw" | "ccw";
export type Status = "ready" | "playing" | "over" | "left";
export type ClearPhase = "burst" | "fall" | "land" | null;

export interface Progress {
  axes: Record<CraftedAxeId, number>;
  ore: Record<OreId, number>;
  /** Ores ever mined, kept after the pile is spent to zero. */
  found: OreId[];
  mined: number;
  sound: boolean;
  played: SiteId[];
  /** Pickaxes ever held, kept after they are spent. */
  had: CraftedAxeId[];
  equipped: AxeId;
  unlocked: SiteId[];
}

export interface Piece {
  type: PieceType;
  ores: OreId[];
  r: Rotation;
  x: number;
  y: number;
}

export interface PieceCell {
  x: number;
  y: number;
  ore: OreId;
}

export interface FallMove {
  x: number;
  from: number;
  to: number;
  ore: OreId;
}

export interface MineRow {
  y: number;
  clearAll: boolean;
  mined: PieceCell[];
}

export interface MineGroup {
  ore: OreId;
  amount: number;
  doubled: number;
  rows: number;
}

export type GameEvent =
  | { type: "over" }
  | { type: "perfect" }
  | { type: "locked"; cells: { x: number; y: number }[] }
  | { type: "burst"; cells: PieceCell[]; rows: number[]; chain: number }
  | MineEvent;

export interface MineEvent {
  type: "mine";
  lines: number;
  perfect: boolean;
  rows: number[];
  groups: MineGroup[];
}

export interface GameState {
  progress: Progress;
  ticket: AxeId;
  /** The site vein. Falls back to the ticket's own drops. */
  drops: Drops | null;
  rng: Rng;
  siteId?: SiteId;
  board: Board;
  queue: Piece[];
  bag: PieceType[];
  piece: Piece | null;
  runResources: number;
  runOre: Partial<Record<OreId, number>>;
  durabilityMax: number;
  durabilityLeft: number;
  status: Status;
  fallAcc: number;
  lockAcc: number;
  lockResets: number;
  clearLeft: number;
  clearDuration: number;
  clearPhase: ClearPhase;
  clearCells: string[];
  clearGone: string[];
  clearPlan: PieceCell[][];
  clearStep: number;
  clearWave: number;
  falls: FallMove[];
  buffer: BufferedAction | null;
}

export type EnteredSite = Site & { ticket: AxeId };

/** Where the save lives. Web uses localStorage; native passes its own store. */
export interface SaveStore {
  load(): string | null;
  save(json: string): void;
}

const SAVE_KEY = "tetris-mine-save-v2";

const browserStore: SaveStore = {
  load: () => globalThis.localStorage?.getItem(SAVE_KEY) ?? null,
  save: (json) => globalThis.localStorage?.setItem(SAVE_KEY, json),
};

let saveStore: SaveStore = browserStore;

export function setSaveStore(store: SaveStore): void {
  saveStore = store;
}

type SavedProgress = Partial<Record<keyof Progress, unknown>>;

function entries<K extends string, V>(record: Partial<Record<K, V>>): [K, V][] {
  return Object.entries(record) as [K, V][];
}

export function emptyRow(): Cell[] {
  return Array<Cell>(COLS).fill(null);
}

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, emptyRow);
}

function emptyAxes(): Record<CraftedAxeId, number> {
  return Object.fromEntries(
    PICKAXES.filter((axe) => axe.id !== "simple").map((axe) => [axe.id, 0]),
  ) as Record<CraftedAxeId, number>;
}

function isCraftedAxeId(id: unknown): id is CraftedAxeId {
  return isAxeId(id) && id !== "simple";
}

export function createProgress(saved: unknown): Progress {
  const progress: Progress = {
    axes: emptyAxes(),
    ore: Object.fromEntries(ORES.map((item) => [item.id, 0])) as Record<OreId, number>,
    found: [],
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
  const data = saved as SavedProgress;
  if (data.axes && typeof data.axes === "object") {
    const axes = data.axes as Record<string, unknown>;
    for (const id of Object.keys(progress.axes) as CraftedAxeId[]) {
      const value = Number(axes[id]);
      if (Number.isFinite(value) && value >= 0) progress.axes[id] = Math.floor(value);
    }
    if (progress.axes.bronze === 0 && Number(axes.tin) > 0) {
      progress.axes.bronze = Math.floor(Number(axes.tin));
    }
  }
  if (data.ore && typeof data.ore === "object") {
    const ore = data.ore as Record<string, unknown>;
    for (const item of ORES) {
      const value = Number(ore[item.id]);
      if (Number.isFinite(value) && value >= 0) progress.ore[item.id] = Math.floor(value);
    }
  }
  const found = new Set<OreId>();
  if (Array.isArray(data.found)) {
    for (const id of data.found) {
      if (isOreId(id)) found.add(id);
    }
  }
  for (const item of ORES) {
    if (progress.ore[item.id] > 0) found.add(item.id);
  }
  progress.found = [...found];
  if (typeof data.mined === "number" && Number.isFinite(data.mined) && data.mined > 0) {
    progress.mined = Math.floor(data.mined);
  }
  if (typeof data.sound === "boolean") progress.sound = data.sound;
  if (Array.isArray(data.unlocked)) {
    const ids = data.unlocked.filter((id): id is SiteId => isSiteId(id) && id !== "quarry");
    progress.unlocked = ["quarry", ...ids];
  } else {
    progress.unlocked = legacyReachable(progress);
  }
  if (Array.isArray(data.played)) {
    progress.played = data.played.filter(isSiteId);
  } else {
    progress.played = openSites(progress).map((site) => site.id);
  }
  if (isAxeId(data.equipped)) {
    progress.equipped = data.equipped;
  } else {
    progress.equipped = strongestHeld(progress);
  }
  const had = new Set<CraftedAxeId>();
  if (Array.isArray(data.had)) {
    for (const id of data.had) {
      if (isCraftedAxeId(id)) had.add(id);
    }
  }
  for (const [id, count] of entries(progress.axes)) {
    if (count > 0) had.add(id);
  }
  progress.had = [...had];
  return progress;
}

export function loadProgress(): Progress {
  try {
    const raw = saveStore.load();
    return createProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return createProgress(null);
  }
}

export function saveProgress(progress: Progress): void {
  try {
    saveStore.save(JSON.stringify(progress));
  } catch {
    // Private mode and full disks should not stop the shift.
  }
}

export function ticketsHeld(progress: Progress, axeId: AxeId): number {
  if (axeId === "simple") return Infinity;
  return progress.axes[axeId] ?? 0;
}

export function oreFound(progress: Progress, oreId: OreId): boolean {
  if ((progress.found ?? []).includes(oreId)) return true;
  return (progress.ore[oreId] ?? 0) > 0;
}

export function noteOreFound(progress: Progress, oreId: OreId): void {
  if (!isOreId(oreId)) return;
  if (!Array.isArray(progress.found)) progress.found = [];
  if (!progress.found.includes(oreId)) progress.found.push(oreId);
}

export function axeFound(progress: Progress, axeId: AxeId): boolean {
  if (axeId === "simple") return true;
  if ((progress.had ?? []).includes(axeId)) return true;
  return ticketsHeld(progress, axeId) >= 1;
}

function legacyCanEnter(progress: Progress, site: Site): boolean {
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

function legacyReachable(progress: Progress): SiteId[] {
  return SITES.filter((site) => legacyCanEnter(progress, site)).map((site) => site.id);
}

function strongestHeld(progress: Progress): AxeId {
  for (let index = PICKAXES.length - 1; index >= 0; index -= 1) {
    const id = PICKAXES[index].id;
    if (id !== "simple" && ticketsHeld(progress, id) >= 1) return id;
  }
  return "simple";
}

export function isUnlocked(progress: Progress, siteId: SiteId): boolean {
  if (siteId === "quarry") return true;
  return (progress.unlocked ?? []).includes(siteId);
}

export function canPayUnlock(progress: Progress, siteId: SiteId): boolean {
  const site = siteById(siteId);
  if (!site?.cost || isUnlocked(progress, siteId)) return false;
  return entries(site.cost).every(([id, need]) => progress.ore[id] >= need);
}

export function unlockSite(progress: Progress, siteId: SiteId): boolean {
  if (!canPayUnlock(progress, siteId)) return false;
  const site = siteById(siteId);
  for (const [id, need] of entries(site.cost ?? {})) progress.ore[id] -= need;
  progress.unlocked.push(site.id);
  saveProgress(progress);
  return true;
}

export function equip(progress: Progress, axeId: AxeId): boolean {
  if (!axeById(axeId) || ticketsHeld(progress, axeId) < 1) return false;
  progress.equipped = axeId;
  saveProgress(progress);
  return true;
}

export function canEnter(progress: Progress, siteId: SiteId): boolean {
  if (!isUnlocked(progress, siteId)) return false;
  return ticketsHeld(progress, progress.equipped || "simple") >= 1;
}

export function openSites(progress: Progress): Site[] {
  return SITES.filter((site) => isUnlocked(progress, site.id));
}

export function enterSite(progress: Progress, siteId: SiteId): EnteredSite | null {
  if (!canEnter(progress, siteId)) return null;
  const site = siteById(siteId);
  const ticket = progress.equipped || "simple";
  if (ticket !== "simple") progress.axes[ticket] -= 1;
  if (!progress.played.includes(site.id)) progress.played.push(site.id);
  saveProgress(progress);
  return { ...site, ticket };
}

export function canForge(progress: Progress, axeId: AxeId): boolean {
  const axe = axeById(axeId);
  if (!axe?.cost) return false;
  if (!entries(axe.cost).every(([id, need]) => progress.ore[id] >= need)) return false;
  return entries(axe.spendAxes ?? {}).every(([id, need]) => ticketsHeld(progress, id) >= need);
}

export function forge(progress: Progress, axeId: AxeId): boolean {
  if (axeId === "simple" || !canForge(progress, axeId)) return false;
  const axe = axeById(axeId);
  for (const [id, need] of entries(axe.cost ?? {})) progress.ore[id] -= need;
  for (const [id, need] of entries(axe.spendAxes ?? {})) progress.axes[id] -= need;
  progress.axes[axeId] += 1;
  if (!Array.isArray(progress.had)) progress.had = [];
  if (!progress.had.includes(axeId)) progress.had.push(axeId);
  saveProgress(progress);
  return true;
}

export function rollOre(drops: Drops, rng: Rng): OreId {
  let roll = rng() * 100;
  const weights = entries(drops);
  for (const [id, weight] of weights) {
    roll -= weight;
    if (roll < 0) return id;
  }
  return weights[weights.length - 1][0];
}

export function orientedCells(type: PieceType, ores: readonly OreId[], rotation: number): PieceCell[] {
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

export function worldCells(piece: Piece): PieceCell[] {
  return orientedCells(piece.type, piece.ores, piece.r).map((cell) => ({
    x: cell.x + piece.x,
    y: cell.y + piece.y,
    ore: cell.ore,
  }));
}

export function collides(board: Board, cells: readonly { x: number; y: number }[]): boolean {
  return cells.some((cell) => {
    if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return true;
    if (cell.y < 0) return false;
    return Boolean(board[cell.y][cell.x]);
  });
}

function pullType(state: GameState): PieceType {
  if (state.bag.length === 0) {
    state.bag = BAG.slice();
    for (let i = state.bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(state.rng() * (i + 1));
      [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
    }
  }
  return state.bag.pop() as PieceType;
}

function makePiece(state: GameState): Piece {
  const axe = axeById(state.ticket);
  const drops = state.drops ?? axe.drops;
  const ores = [0, 1, 2, 3].map(() => rollOre(drops, state.rng));
  return { type: pullType(state), ores, r: 0, x: 3, y: 0 };
}

function ensureQueue(state: GameState): void {
  while (state.queue.length < 1) state.queue.push(makePiece(state));
}

export function createState(progress: Progress, ticket: AxeId, rng: Rng = Math.random, drops: Drops | null = null): GameState {
  const axe = axeById(ticket);
  const durability = axe?.durability ?? 1;
  const state: GameState = {
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

function canMove(state: GameState, dx: number, dy: number): boolean {
  if (!state.piece) return false;
  const probe = { ...state.piece, x: state.piece.x + dx, y: state.piece.y + dy };
  return !collides(state.board, worldCells(probe));
}

function noteShift(state: GameState): void {
  if (!state.piece) return;
  if (canMove(state, 0, 1)) return;
  if (state.lockResets < MAX_LOCK_RESETS) {
    state.lockAcc = 0;
    state.lockResets += 1;
  }
}

export function tryMove(state: GameState, dx: number, dy: number, options: { fall?: boolean } = {}): boolean {
  if (state.status !== "playing" || !state.piece || state.clearLeft > 0) return false;
  if (!canMove(state, dx, dy)) return false;
  state.piece.x += dx;
  state.piece.y += dy;
  if (dy === 0) noteShift(state);
  if (dy > 0 && !options.fall) state.fallAcc = 0;
  return true;
}

export function tryRotate(state: GameState, dir: 1 | -1): boolean {
  if (state.status !== "playing" || !state.piece || state.clearLeft > 0) return false;
  const piece = state.piece;
  const from = piece.r;
  const to = ((from + dir + 4) % 4) as Rotation;
  for (const [kx, ky] of kicksFor(piece.type, from, to)) {
    const probe = { ...piece, r: to, x: piece.x + kx, y: piece.y + ky };
    if (!collides(state.board, worldCells(probe))) {
      piece.r = to;
      piece.x = probe.x;
      piece.y = probe.y;
      noteShift(state);
      return true;
    }
  }
  return false;
}

export function mineFullRows(board: Board, wildcards: readonly OreId[] = []): {
  board: Board;
  mined: PieceCell[];
  moves: FallMove[];
  rows: MineRow[];
} {
  const wild = new Set<Cell>(wildcards);
  const next = board.map((row) => row.slice());
  const targets: number[] = [];
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (next[y].every(Boolean)) targets.push(y);
  }
  if (targets.length === 0) return { board, mined: [], moves: [], rows: [] };

  const mined: PieceCell[] = [];
  const rows: MineRow[] = [];
  for (const y of targets) {
    const row = next[y];
    const clearAll = row.every((cell) => !wild.has(cell));
    const cells: PieceCell[] = [];
    for (let x = 0; x < COLS; x += 1) {
      const ore = row[x];
      if (ore && (clearAll || wild.has(ore))) {
        const cell = { x, y, ore };
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

function payableCounts(mined: readonly PieceCell[], clearAll: boolean): Map<OreId, number> {
  const counts = new Map<OreId, number>();
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
  const paid = new Map<OreId, number>();
  for (const [ore, count] of counts) {
    if (count === best) paid.set(ore, count);
  }
  return paid;
}

function fallAbove(board: Board, floor: number): FallMove[] {
  const moves: FallMove[] = [];
  for (let x = 0; x < COLS; x += 1) {
    const falling: { y: number; ore: OreId }[] = [];
    for (let y = 0; y <= floor; y += 1) {
      const ore = board[y][x];
      if (ore) falling.push({ y, ore });
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

function planFrom(mined: readonly PieceCell[]): PieceCell[][] {
  const byRow = new Map<number, PieceCell[]>();
  for (const cell of mined) {
    const row = byRow.get(cell.y) ?? [];
    row.push(cell);
    byRow.set(cell.y, row);
  }
  return [...byRow.keys()].sort((a, b) => b - a).map((y) => byRow.get(y) ?? []);
}

function queueWave(state: GameState): boolean {
  const { mined } = mineFullRows(state.board, axeById(state.ticket).wildcards);
  if (mined.length === 0) return false;
  state.clearPlan = planFrom(mined);
  state.clearStep = 0;
  return true;
}

function armBurst(state: GameState): GameEvent {
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

function payout(state: GameState, count: number): { total: number; doubled: number } {
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

function spawn(state: GameState): GameEvent[] {
  ensureQueue(state);
  const piece = state.queue.shift() ?? null;
  state.piece = piece;
  ensureQueue(state);
  state.fallAcc = 0;
  state.lockAcc = 0;
  state.lockResets = 0;
  if (piece && collides(state.board, worldCells(piece))) {
    state.piece = null;
    state.status = "over";
    saveProgress(state.progress);
    return [{ type: "over" }];
  }
  return [];
}

function settleMine(state: GameState): MineEvent | null {
  const axe = axeById(state.ticket);
  const { board, mined, moves, rows } = mineFullRows(state.board, axe.wildcards);
  if (mined.length === 0) return null;
  state.board = board;
  state.falls = moves;
  const groups = new Map<OreId, MineGroup>();
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

export function resolveClear(state: GameState): GameEvent[] {
  const events: MineEvent[] = [];
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
  const all: GameEvent[] = [...events];
  if (perfect) {
    events[events.length - 1].perfect = true;
    all.push({ type: "perfect" });
  }
  saveProgress(state.progress);
  return all;
}

function lockPiece(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  if (!state.piece) return events;
  const cells = worldCells(state.piece);
  if (cells.some((cell) => cell.y < 0)) {
    state.piece = null;
    state.status = "over";
    saveProgress(state.progress);
    events.push({ type: "over" });
    return events;
  }

  for (const cell of cells) state.board[cell.y][cell.x] = cell.ore;
  state.piece = null;
  events.push({ type: "locked", cells: cells.map((cell) => ({ x: cell.x, y: cell.y })) });

  const pending = mineFullRows(state.board, axeById(state.ticket).wildcards).mined;
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

export function hardDrop(state: GameState): GameEvent[] {
  if (state.status !== "playing" || !state.piece || state.clearLeft > 0) return [];
  while (tryMove(state, 0, 1, { fall: true }));
  return lockPiece(state);
}

export function queueAction(state: GameState, action: Action): { accepted: boolean; events: GameEvent[] } {
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

function applyBuffer(state: GameState): GameEvent[] {
  const action = state.buffer;
  state.buffer = null;
  if (!action || state.status !== "playing") return [];
  return queueAction(state, action).events;
}

export function startShift(state: GameState): void {
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

export function resetProgress(progress: Progress): void {
  const sound = progress.sound;
  const fresh = createProgress(null);
  progress.axes = fresh.axes;
  progress.ore = fresh.ore;
  progress.found = fresh.found;
  progress.mined = 0;
  progress.sound = sound;
  progress.played = fresh.played;
  progress.had = fresh.had;
  progress.equipped = fresh.equipped;
  progress.unlocked = fresh.unlocked;
  saveProgress(progress);
}

function finishClear(state: GameState, events: GameEvent[]): GameEvent[] {
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

export function tick(state: GameState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
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
