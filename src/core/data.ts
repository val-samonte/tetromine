// Ore order follows Melvor Idle through gold, with stone as the tutorial rock.
// Stone Quarry is 99% stone and 1% coal. Copper Cut and Tin Drift use
// the opening tables. Iron Hollow is stone 12%, copper 35%, tin 23%, iron 30%.
// Coal Seam is tin 30%, coal 30%,
// copper 10%, stone 30%. Silver Lode is stone 8%, copper 14%, tin 14%,
// iron 24%, coal 25%, silver 15%. Gold Reef has no stone. Gold is 5%,
// silver 40%, iron 21%, coal 12%, copper 10%, tin 12%.
//
// Pickaxe recipes use Melvor bar ratios, scaled so a pure row of 10 is the unit:
// bronze 1 copper : 1 tin, iron bar 1 iron, steel 1 iron : 2 coal,
// silver bar 1 silver. Silver also spends one Steel Pickaxe.

export type OreId = "stone" | "copper" | "tin" | "iron" | "coal" | "silver" | "gold";
export type AxeId = "simple" | "stone" | "copper" | "bronze" | "iron" | "steel" | "silver" | "mythril";
/** Pickaxes you forge and hold a count of. The simple pickaxe is free and never runs out. */
export type CraftedAxeId = Exclude<AxeId, "simple">;
export type SiteId = "quarry" | "copper" | "tin" | "iron" | "coal" | "silver" | "gold";
export type PieceType = "T" | "J" | "L" | "S" | "Z" | "O" | "I";
export type Rotation = 0 | 1 | 2 | 3;

/** Percent weights per ore. Every vein sums to 100. */
export type Drops = Partial<Record<OreId, number>>;
export type OreCost = Partial<Record<OreId, number>>;
export type AxeCost = Partial<Record<CraftedAxeId, number>>;
export type Point = readonly [number, number];

export interface Ore {
  id: OreId;
  name: string;
  symbol: string;
  fill: string;
  deep: string;
  ink: string;
  mark: "pit" | "ring" | "tri" | "ingot" | "shard" | "diamond" | "sun";
}

export interface Pickaxe {
  id: AxeId;
  name: string;
  /** Mine evaluations the head survives in one run. */
  durability: number;
  drops: Drops;
  yield: number;
  doubleChance: number;
  /** Ores this head mines out of a mixed row ("Strong against" in the UI). */
  wildcards: readonly OreId[];
  cost: OreCost | null;
  spendAxes?: AxeCost;
  enters: string;
  note: string;
}

export interface Site {
  id: SiteId;
  name: string;
  /** tickets[0] is the pickaxe whose vein the site uses. */
  tickets: readonly AxeId[];
  cost: OreCost | null;
  place: string;
}

export interface Shape {
  pivot: Point;
  cells: readonly Point[];
}

export const COLS = 10;
export const ROWS = 20;

export const ORES: readonly Ore[] = [
  { id: "stone", name: "Stone", symbol: "St", fill: "#a89880", deep: "#5e5346", ink: "#1a140e", mark: "pit" },
  { id: "copper", name: "Copper Ore", symbol: "Cu", fill: "#e0703a", deep: "#8a3c16", ink: "#2a1006", mark: "ring" },
  { id: "tin", name: "Tin Ore", symbol: "Sn", fill: "#3fafa4", deep: "#14625c", ink: "#041614", mark: "tri" },
  { id: "iron", name: "Iron Ore", symbol: "Fe", fill: "#d15a4a", deep: "#7a2a22", ink: "#2a0c08", mark: "ingot" },
  { id: "coal", name: "Coal Ore", symbol: "C", fill: "#3a3f66", deep: "#1a1d33", ink: "#f3ead7", mark: "shard" },
  { id: "silver", name: "Silver Ore", symbol: "Ag", fill: "#e7eef6", deep: "#8b98a8", ink: "#14181e", mark: "diamond" },
  { id: "gold", name: "Gold Ore", symbol: "Au", fill: "#f0c14a", deep: "#8a6914", ink: "#2a2208", mark: "sun" },
];

export const ORE_BY_ID = Object.fromEntries(ORES.map((ore) => [ore.id, ore])) as Record<OreId, Ore>;

export const PICKAXES: readonly Pickaxe[] = [
  {
    id: "simple",
    name: "Simple Pickaxe",
    durability: 68,
    drops: { stone: 99, coal: 1 },
    yield: 1,
    doubleChance: 0,
    wildcards: [],
    cost: null,
    enters: "Coal ore is 1%. The rest is stone.",
    note: "The starter head. Nothing but stone will break.",
  },
  {
    id: "stone",
    name: "Stone Pickaxe",
    durability: 36,
    drops: { stone: 80, copper: 20 },
    yield: 1,
    doubleChance: 0,
    wildcards: ["stone"],
    cost: { stone: 60 },
    enters: "Copper ore enters the vein at 20%.",
    note: "Cut from stone. Copper is a Melvor level-1 rock, and this is the head that finds it.",
  },
  {
    id: "copper",
    name: "Copper Pickaxe",
    durability: 80,
    drops: { stone: 35, copper: 50, tin: 15 },
    yield: 1,
    doubleChance: 0.05,
    wildcards: ["stone", "copper"],
    cost: { copper: 40 },
    enters: "Tin ore is 15%. Stone 35%, copper 50%.",
    note: "Melvor tin is the other level-1 rock. 5% of mined blocks pay double.",
  },
  {
    id: "bronze",
    name: "Bronze Pickaxe",
    durability: 96,
    drops: { stone: 12, copper: 35, tin: 23, iron: 30 },
    yield: 1,
    doubleChance: 0.08,
    wildcards: ["copper", "tin"],
    cost: { copper: 40, tin: 40 },
    enters: "Iron ore is 30%. Tin 23%, copper 35%, stone 12%.",
    note: "Melvor bronze bar is 1 copper ore + 1 tin ore. This head opens the iron deposit.",
  },
  {
    id: "iron",
    name: "Iron Pickaxe",
    durability: 112,
    drops: { stone: 30, copper: 10, tin: 30, coal: 30 },
    yield: 1,
    doubleChance: 0.1,
    wildcards: ["stone", "copper", "iron"],
    cost: { iron: 40 },
    enters: "Coal ore is 30%. Tin 30%, copper 10%, stone 30%.",
    note: "Melvor iron bar is 1 iron ore. 10% of mined blocks pay double.",
  },
  {
    id: "steel",
    name: "Steel Pickaxe",
    durability: 160,
    drops: { stone: 8, copper: 14, tin: 14, iron: 24, coal: 25, silver: 15 },
    yield: 1,
    doubleChance: 0.12,
    wildcards: ["stone", "iron", "coal"],
    cost: { iron: 40, coal: 80 },
    enters: "Silver ore is 15%. Tin 14%, iron 24%, coal 25%, copper 14%, stone 8%.",
    note: "Melvor steel bar is 1 iron ore + 2 coal ore. Same ratio. 12% of mined blocks pay double.",
  },
  {
    id: "silver",
    name: "Silver Pickaxe",
    durability: 132,
    drops: { copper: 10, tin: 12, iron: 21, coal: 12, silver: 40, gold: 5 },
    yield: 1,
    doubleChance: 0.15,
    wildcards: ["silver"],
    cost: { silver: 40 },
    spendAxes: { steel: 1 },
    enters: "Gold ore is 5%. Silver 40%, iron 21%, coal 12%, copper 10%, tin 12%.",
    note: "Melvor silver bar is 1 silver ore. Needs a Steel Pickaxe. 15% of mined blocks pay double.",
  },
  {
    id: "mythril",
    name: "Mythril Pickaxe",
    durability: 134,
    drops: { copper: 10, tin: 12, iron: 21, coal: 12, silver: 40, gold: 5 },
    yield: 1,
    doubleChance: 0.15,
    wildcards: ["stone"],
    cost: { silver: 1000, stone: 1000 },
    enters: "Gold ore is 5%. Silver 40%, iron 21%, coal 12%, copper 10%, tin 12%.",
    note: "A late head. Strong against stone. Lasts longer than silver.",
  },
];

export const LOCK_DELAY = 500;
export const MAX_LOCK_RESETS = 15;
export const CLEAR_BURST = 340;
export const CLEAR_FALL = 220;
export const CLEAR_LAND = 160;
export const DAS = 170;
export const ARR = 30;
export const SOFT_DROP_MS = 45;

export const SHAPES: Readonly<Record<PieceType, Shape>> = {
  T: { pivot: [1, 1], cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  J: { pivot: [1, 1], cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { pivot: [1, 1], cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  S: { pivot: [1, 1], cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { pivot: [1, 1], cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  O: { pivot: [1.5, 0.5], cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  I: { pivot: [1.5, 1.5], cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
};

export const BAG: readonly PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

type KickTable = Readonly<Record<`${Rotation}>${Rotation}`, readonly Point[]>>;

// Kick offsets, y positive down. Source: Tetris SRS, y flipped from the wiki's y-up tables.
const JLSTZ: Partial<KickTable> = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS: Partial<KickTable> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function kicksFor(type: PieceType, from: Rotation, to: Rotation): readonly Point[] {
  if (type === "O") return [[0, 0]];
  const table = type === "I" ? I_KICKS : JLSTZ;
  return table[`${from}>${to}`] ?? [[0, 0]];
}

// Fall interval (ms) by durability spent. Segments lerp in log space.
// Exact 100% spent snaps to soft-drop / turbo speed; the curve only approaches 100ms.
const GRAVITY_SPENT: readonly Point[] = [
  [0, 1000],
  [0.25, 700],
  [0.5, 400],
  [0.75, 200],
  [1, 100],
];

export function gravityForSpent(spent: number): number {
  const t = Math.min(1, Math.max(0, spent));
  if (t >= 1) return SOFT_DROP_MS;
  for (let i = 0; i < GRAVITY_SPENT.length - 1; i += 1) {
    const [s0, g0] = GRAVITY_SPENT[i];
    const [s1, g1] = GRAVITY_SPENT[i + 1];
    if (t > s1) continue;
    const u = s1 === s0 ? 1 : (t - s0) / (s1 - s0);
    return Math.round(Math.exp(Math.log(g0) + (Math.log(g1) - Math.log(g0)) * u));
  }
  return GRAVITY_SPENT[GRAVITY_SPENT.length - 1][1];
}

export function durabilitySpent(state: { durabilityMax: number; durabilityLeft: number }): number {
  const max = state.durabilityMax || 1;
  return Math.min(1, Math.max(0, 1 - (state.durabilityLeft ?? 0) / max));
}

export function costEntries(cost: OreCost | null | undefined): { ore: Ore; need: number }[] {
  if (!cost) return [];
  return ORES.filter((ore) => cost[ore.id]).map((ore) => ({
    ore,
    need: cost[ore.id] ?? 0,
  }));
}

export function axeSpendEntries(spendAxes: AxeCost | null | undefined): { axe: Pickaxe; need: number }[] {
  if (!spendAxes) return [];
  return PICKAXES.filter((axe) => axe.id !== "simple" && spendAxes[axe.id]).map((axe) => ({
    axe,
    need: spendAxes[axe.id as CraftedAxeId] ?? 0,
  }));
}

// tickets[0] is the vein. cost is the one-time ore spend that unlocks the site.
// Those costs are double the pickaxe that used to open the site. Quarry stays open.
export const SITES: readonly Site[] = [
  {
    id: "quarry",
    name: "Stone Quarry",
    tickets: ["simple"],
    cost: null,
    place: "Loose rock. Coal shows in one block out of a hundred.",
  },
  {
    id: "copper",
    name: "Copper Cut",
    tickets: ["stone"],
    cost: { stone: 120 },
    place: "The wall is still mostly stone. One block in five is copper.",
  },
  {
    id: "tin",
    name: "Tin Drift",
    tickets: ["copper"],
    cost: { copper: 80 },
    place: "Stone, copper, and tin sit in the same stones.",
  },
  {
    id: "iron",
    name: "Iron Hollow",
    tickets: ["bronze"],
    cost: { copper: 100, tin: 80 },
    place: "The wall is mostly stone. Copper is common. Iron is scarce.",
  },
  {
    id: "coal",
    name: "Coal Seam",
    tickets: ["iron"],
    cost: { iron: 80 },
    place: "Tin and coal share the wall. Stone fills the rest. Copper is scarce.",
  },
  {
    id: "silver",
    name: "Silver Lode",
    tickets: ["steel"],
    cost: { stone: 1000, iron: 80, coal: 160 },
    place: "Silver shows in the wall. Coal is the common rock.",
  },
  {
    id: "gold",
    name: "Gold Reef",
    tickets: ["silver"],
    cost: { stone: 2000, silver: 200 },
    place: "Gold shows in the wall. Silver is the common metal.",
  },
];

export function isOreId(id: unknown): id is OreId {
  return typeof id === "string" && ORES.some((ore) => ore.id === id);
}

export function isAxeId(id: unknown): id is AxeId {
  return typeof id === "string" && PICKAXES.some((axe) => axe.id === id);
}

export function isSiteId(id: unknown): id is SiteId {
  return typeof id === "string" && SITES.some((site) => site.id === id);
}

export function axeById(id: AxeId): Pickaxe;
export function axeById(id: string | null | undefined): Pickaxe | undefined;
export function axeById(id: string | null | undefined): Pickaxe | undefined {
  return PICKAXES.find((axe) => axe.id === id);
}

export function siteById(id: SiteId): Site;
export function siteById(id: string | null | undefined): Site | undefined;
export function siteById(id: string | null | undefined): Site | undefined {
  return SITES.find((site) => site.id === id);
}

export function siteForTicket(ticket: AxeId): Site | undefined {
  return SITES.find((site) => site.tickets.includes(ticket));
}

export function dropList(drops: Drops): { ore: Ore; pct: number }[] {
  return ORES.filter((ore) => drops[ore.id]).map((ore) => ({
    ore,
    pct: drops[ore.id] ?? 0,
  }));
}
