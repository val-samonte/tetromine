// Ore order follows Melvor Idle through gold, with stone as the tutorial rock.
// Stone Quarry is 99.9% stone and 0.1% coal. Copper Cut and Tin Drift use
// the opening tables. Iron Hollow is stone 60%, copper 35%, iron 5%.
// Coal Seam is tin 30%, coal 30%,
// copper 10%, stone 30%.
//
// Pickaxe recipes use Melvor bar ratios, scaled so a pure row of 10 is the unit:
// bronze 1 copper : 1 tin, iron bar 1 iron, steel 1 iron : 2 coal,
// silver bar 1 silver, gold bar 1 gold.

export const COLS = 10;
export const ROWS = 20;

export const ORES = [
  { id: "stone", name: "Stone", symbol: "St", fill: "#a89880", deep: "#5e5346", ink: "#1a140e", mark: "pit" },
  { id: "copper", name: "Copper Ore", symbol: "Cu", fill: "#e0703a", deep: "#8a3c16", ink: "#2a1006", mark: "ring" },
  { id: "tin", name: "Tin Ore", symbol: "Sn", fill: "#3fafa4", deep: "#14625c", ink: "#041614", mark: "tri" },
  { id: "iron", name: "Iron Ore", symbol: "Fe", fill: "#d15a4a", deep: "#7a2a22", ink: "#2a0c08", mark: "ingot" },
  { id: "coal", name: "Coal Ore", symbol: "C", fill: "#3a3f66", deep: "#1a1d33", ink: "#f3ead7", mark: "shard" },
  { id: "silver", name: "Silver Ore", symbol: "Ag", fill: "#e7eef6", deep: "#8b98a8", ink: "#14181e", mark: "diamond" },
  { id: "gold", name: "Gold Ore", symbol: "Au", fill: "#f0c14a", deep: "#8a6914", ink: "#2a2208", mark: "sun" },
];

export const ORE_BY_ID = Object.fromEntries(ORES.map((ore) => [ore.id, ore]));

export const PICKAXES = [
  {
    id: "simple",
    name: "Simple Pickaxe",
    hardAt: 1500,
    drops: { stone: 99.9, coal: 0.1 },
    yield: 1,
    doubleChance: 0,
    wildcards: [],
    cost: null,
    enters: "Coal ore is 0.1%. The rest is stone.",
    note: "The starter head. Nothing but stone will break.",
  },
  {
    id: "stone",
    name: "Stone Pickaxe",
    hardAt: 1000,
    drops: { stone: 80, copper: 20 },
    yield: 1,
    doubleChance: 0,
    wildcards: ["stone"],
    cost: { stone: 30 },
    enters: "Copper ore enters the vein at 20%.",
    note: "Cut from stone. Copper is a Melvor level-1 rock, and this is the head that finds it.",
  },
  {
    id: "copper",
    name: "Copper Pickaxe",
    hardAt: 800,
    drops: { stone: 50, copper: 30, tin: 20 },
    yield: 1,
    doubleChance: 0.05,
    wildcards: ["stone", "copper"],
    cost: { copper: 20 },
    enters: "Tin ore enters at 20%. Stone 50%, copper 30%.",
    note: "Melvor tin is the other level-1 rock. 5% of mined blocks pay double.",
  },
  {
    id: "bronze",
    name: "Bronze Pickaxe",
    hardAt: 650,
    drops: { stone: 60, copper: 35, iron: 5 },
    yield: 1,
    doubleChance: 0.08,
    wildcards: ["stone", "copper", "tin"],
    cost: { copper: 20, tin: 20 },
    enters: "Iron ore enters at 5%. Stone 60%, copper 35%.",
    note: "Melvor bronze bar is 1 copper ore + 1 tin ore. This head opens the iron deposit.",
  },
  {
    id: "iron",
    name: "Iron Pickaxe",
    hardAt: 500,
    drops: { stone: 30, copper: 10, tin: 30, coal: 30 },
    yield: 1,
    doubleChance: 0.1,
    wildcards: ["stone", "copper", "iron"],
    cost: { iron: 20 },
    enters: "Coal ore is 30%. Tin 30%, copper 10%, stone 30%.",
    note: "Melvor iron bar is 1 iron ore. 10% of mined blocks pay double.",
  },
  {
    id: "steel",
    name: "Steel Pickaxe",
    hardAt: 400,
    drops: { stone: 12, copper: 7, tin: 12, iron: 19, coal: 30, silver: 20 },
    yield: 1,
    doubleChance: 0.12,
    wildcards: ["stone", "iron", "coal"],
    cost: { iron: 20, coal: 40 },
    enters: "Silver ore enters at 20%. Coal moves to 30%.",
    note: "Melvor steel bar is 1 iron ore + 2 coal ore. Same ratio. 12% of mined blocks pay double.",
  },
  {
    id: "silver",
    name: "Silver Pickaxe",
    hardAt: 320,
    drops: { stone: 8, copper: 4, tin: 7, iron: 12, coal: 19, silver: 30, gold: 20 },
    yield: 1,
    doubleChance: 0.15,
    wildcards: ["stone", "silver"],
    cost: { silver: 20 },
    enters: "Gold ore enters at 20%. Silver moves to 30%.",
    note: "Melvor silver bar is 1 silver ore. 15% of mined blocks pay double.",
  },
  {
    id: "gold",
    name: "Gold Pickaxe",
    hardAt: 250,
    drops: { stone: 8, copper: 4, tin: 7, iron: 12, coal: 19, silver: 30, gold: 20 },
    yield: 2,
    doubleChance: 0.2,
    wildcards: ["stone", "gold"],
    cost: { gold: 20 },
    enters: "No new ore. Every mined block pays double, and 20% of those pay double again.",
    note: "Melvor gold bar is 1 gold ore. Last head on this claim.",
  },
];

export const LOCK_DELAY = 500;
export const MAX_LOCK_RESETS = 15;
export const CLEAR_BURST = 340;
export const CLEAR_FALL = 220;
export const CLEAR_LAND = 160;
export const DAS = 170;
export const ARR = 30;

export const SHAPES = {
  T: { pivot: [1, 1], cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  J: { pivot: [1, 1], cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { pivot: [1, 1], cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  S: { pivot: [1, 1], cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { pivot: [1, 1], cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  O: { pivot: [1.5, 0.5], cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  I: { pivot: [1.5, 1.5], cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
};

export const BAG = ["I", "O", "T", "S", "Z", "J", "L"];

// Kick offsets, y positive down. Source: Tetris SRS, y flipped from the wiki's y-up tables.
const JLSTZ = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function kicksFor(type, from, to) {
  if (type === "O") return [[0, 0]];
  const table = type === "I" ? I_KICKS : JLSTZ;
  return table[`${from}>${to}`];
}

const GRAVITY_EASY = 1000;
const GRAVITY_HARD = 180;

export function gravityFor(resources, hardAt) {
  const t = Math.min(1, Math.max(0, resources) / hardAt);
  return Math.round(GRAVITY_EASY - t * t * (GRAVITY_EASY - GRAVITY_HARD));
}

export function costEntries(cost) {
  if (!cost) return [];
  return ORES.filter((ore) => cost[ore.id]).map((ore) => ({
    ore,
    need: cost[ore.id],
  }));
}

// A site lists every pickaxe allowed in. The vein shown for the site is the
// drop table of those pickaxes. Simple never breaks, and it opens the quarry.
export const SITES = [
  {
    id: "quarry",
    name: "Stone Quarry",
    tickets: ["simple"],
    place: "Loose rock. Coal shows in one block out of a thousand.",
  },
  {
    id: "copper",
    name: "Copper Cut",
    tickets: ["stone"],
    place: "The wall is still mostly stone. One block in five is copper.",
  },
  {
    id: "tin",
    name: "Tin Drift",
    tickets: ["copper"],
    place: "Stone, copper, and tin sit in the same stones.",
  },
  {
    id: "iron",
    name: "Iron Hollow",
    tickets: ["bronze"],
    place: "The wall is mostly stone. Copper is common. Iron is scarce.",
  },
  {
    id: "coal",
    name: "Coal Seam",
    tickets: ["iron"],
    place: "Tin and coal share the wall. Stone fills the rest. Copper is scarce.",
  },
  {
    id: "silver",
    name: "Silver Lode",
    tickets: ["steel"],
    place: "Silver shows in the wall. Coal is the common rock.",
  },
  {
    id: "gold",
    name: "Gold Reef",
    tickets: ["silver"],
    place: "Gold shows in the wall. Silver is the common metal.",
  },
  {
    id: "deep-gold",
    name: "Deep Gold",
    tickets: ["gold"],
    place: "The same reef. Every mined block pays double.",
  },
];

export function axeById(id) {
  return PICKAXES.find((axe) => axe.id === id);
}

export function siteById(id) {
  return SITES.find((site) => site.id === id);
}

export function siteForTicket(ticket) {
  return SITES.find((site) => site.tickets.includes(ticket));
}

export function dropList(drops) {
  return ORES.filter((ore) => drops[ore.id]).map((ore) => ({
    ore,
    pct: drops[ore.id],
  }));
}
