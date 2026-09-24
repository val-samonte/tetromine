import assert from "node:assert/strict";
import test from "node:test";
import { ORES, PICKAXES, SITES, axeById, gravityForSpent, durabilitySpent, CLEAR_BURST, CLEAR_FALL, CLEAR_LAND } from "../src/data.js";
import {
  canEnter,
  canForge,
  createProgress,
  createState,
  enterSite,
  equip,
  forge,
  unlockSite,
  hardDrop,
  openSites,
  orientedCells,
  resolveClear,
  rollOre,
  startShift,
  tick,
  tryMove,
} from "../src/engine.js";

test("every vein sums to 100 and the opening tables match the brief", () => {
  for (const axe of PICKAXES) {
    const sum = Object.values(axe.drops).reduce((total, weight) => total + weight, 0);
    assert.equal(sum, 100, axe.id);
  }
  assert.deepEqual(PICKAXES[0].drops, { stone: 99, coal: 1 });
  assert.equal(rollOre(PICKAXES[0].drops, () => 0.989), "stone");
  assert.equal(rollOre(PICKAXES[0].drops, () => 0.99), "coal");
  assert.deepEqual(PICKAXES[1].drops, { stone: 80, copper: 20 });
  assert.deepEqual(PICKAXES[2].drops, { stone: 35, copper: 50, tin: 15 });
  assert.deepEqual(PICKAXES.find((axe) => axe.id === "bronze").drops, { stone: 12, copper: 35, tin: 23, iron: 30 });
  assert.deepEqual(PICKAXES.find((axe) => axe.id === "iron").drops, { stone: 30, copper: 10, tin: 30, coal: 30 });
  assert.deepEqual(PICKAXES.find((axe) => axe.id === "steel").drops, { stone: 8, copper: 14, tin: 14, iron: 24, coal: 25, silver: 15 });
  assert.deepEqual(PICKAXES.find((axe) => axe.id === "silver").drops, { copper: 10, tin: 12, iron: 21, coal: 12, silver: 40, gold: 5 });
});

test("forge costs keep Melvor bar ratios", () => {
  const byId = Object.fromEntries(PICKAXES.map((axe) => [axe.id, axe]));
  assert.deepEqual(byId.stone.cost, { stone: 60 });
  assert.deepEqual(byId.copper.cost, { copper: 40 });
  assert.deepEqual(byId.bronze.cost, { copper: 40, tin: 40 });
  assert.ok(PICKAXES.findIndex((axe) => axe.id === "bronze") < PICKAXES.findIndex((axe) => axe.id === "iron"));
  assert.equal(SITES.find((site) => site.tickets.includes("bronze")).id, "iron");
  assert.equal(byId.steel.cost.coal, byId.steel.cost.iron * 2);
  assert.deepEqual(byId.silver.cost, { silver: 40 });
  assert.deepEqual(byId.silver.spendAxes, { steel: 1 });
  assert.deepEqual(byId.mythril.cost, { silver: 12000, stone: 12000 });
  assert.deepEqual(byId.mythril.wildcards, ["stone"]);
  assert.equal(byId.simple.cost, null);
});

test("forging silver spends a steel pickaxe", () => {
  const progress = createProgress(null);
  progress.ore.silver = 40;
  assert.equal(canForge(progress, "silver"), false);
  progress.axes.steel = 1;
  assert.equal(canForge(progress, "silver"), true);
  assert.equal(forge(progress, "silver"), true);
  assert.equal(progress.ore.silver, 0);
  assert.equal(progress.axes.steel, 0);
  assert.equal(progress.axes.silver, 1);
});

test("a site unlocks by spending ore, and enter spends the equipped pickaxe", () => {
  assert.ok(SITES.every((site) => site.tickets.length >= 1));
  const progress = createProgress(null);
  assert.equal(progress.equipped, "simple");
  assert.deepEqual(openSites(progress).map((site) => site.id), ["quarry"]);
  assert.equal(enterSite(progress, "quarry")?.ticket, "simple");
  assert.equal(progress.axes.stone, 0);

  progress.ore.stone = 120;
  assert.equal(unlockSite(progress, "copper"), true);
  assert.equal(progress.ore.stone, 0);
  assert.equal(unlockSite(progress, "copper"), false);
  assert.deepEqual(openSites(progress).map((site) => site.id), ["quarry", "copper"]);
  assert.equal(canEnter(progress, "copper"), true);

  progress.ore.stone = 60;
  assert.equal(forge(progress, "stone"), true);
  assert.equal(equip(progress, "stone"), true);
  assert.equal(enterSite(progress, "copper")?.ticket, "stone");
  assert.equal(progress.axes.stone, 0);
  assert.ok(progress.had.includes("stone"));
  assert.equal(canEnter(progress, "copper"), false);
  assert.equal(enterSite(progress, "copper"), null);
  assert.equal(canForge(progress, "simple"), false);
  assert.deepEqual(progress.played, ["quarry", "copper"]);
});

test("a pickaxe you already had is remembered after it is spent", () => {
  const fresh = createProgress(null);
  fresh.ore.stone = 60;
  assert.equal(forge(fresh, "stone"), true);
  assert.deepEqual(fresh.had, ["stone"]);

  const spent = createProgress({ axes: { stone: 0 }, had: ["stone"] });
  assert.ok(spent.had.includes("stone"));
  assert.equal(spent.axes.stone, 0);

  const held = createProgress({ axes: { iron: 2 } });
  assert.ok(held.had.includes("iron"));
  assert.equal(held.had.includes("stone"), false);
});

test("an older save treats sites it can already enter as played", () => {
  const progress = createProgress({ axes: { stone: 1, copper: 2 } });
  assert.deepEqual(progress.played, ["quarry", "copper", "tin"]);
  assert.equal(enterSite(progress, "iron"), null);
  progress.ore.copper = 100;
  progress.ore.tin = 80;
  assert.equal(unlockSite(progress, "iron"), true);
  assert.equal(progress.played.includes("iron"), false);
  assert.equal(enterSite(progress, "iron")?.id, "iron");
  assert.equal(progress.played.includes("iron"), true);
});

test("an older save keeps sites the held pickaxes already opened", () => {
  const progress = createProgress({ axes: { stone: 1, iron: 2 } });
  assert.equal(progress.equipped, "iron");
  assert.ok(progress.unlocked.includes("quarry"));
  assert.ok(progress.unlocked.includes("copper"));
  assert.equal(progress.unlocked.includes("iron"), false);
  assert.ok(progress.unlocked.includes("coal"));
  assert.equal(progress.unlocked.includes("tin"), false);
});

test("entering spends the equipped pickaxe and keeps the site vein", () => {
  const progress = createProgress(null);
  progress.axes.iron = 1;
  progress.unlocked = ["quarry", "copper"];
  assert.equal(equip(progress, "iron"), true);
  const entered = enterSite(progress, "copper");
  assert.equal(entered.ticket, "iron");
  assert.equal(progress.axes.iron, 0);
  assert.equal(progress.axes.stone, 0);
  const state = createState(progress, entered.ticket, () => 0.99, axeById(entered.tickets[0]).drops);
  assert.ok(state.queue.every((piece) => piece.ores.every((ore) => ore === "copper")));
});

test("a run rolls the ticket's vein, not a later pickaxe", () => {
  const simple = createState(createProgress(null), "simple", () => 0.989);
  assert.ok(simple.queue.every((piece) => piece.ores.every((ore) => ore === "stone")));
  const copper = createState(createProgress(null), "copper", () => 0.99);
  assert.ok(copper.queue.every((piece) => piece.ores.every((ore) => ore === "tin")));
});

test("a full row the pickaxe is not strong against clears completely", () => {
  const progress = createProgress(null);
  const state = createState(progress, "simple", () => 0.5);
  state.board[17] = Array(10).fill("stone");
  state.board[18] = ["copper", ...Array(9).fill("stone")];
  state.board[19] = Array(10).fill("tin");
  resolveClear(state);
  assert.equal(progress.ore.stone, 19);
  assert.equal(progress.ore.tin, 0);
  assert.equal(progress.ore.copper, 0);
  assert.equal(state.board.every((row) => row.every((cell) => cell === null)), true);

  const mixed = createState(createProgress(null), "stone", () => 0);
  mixed.board[19] = ["iron", "copper", "tin", "iron", "copper", "tin", "iron", "copper", "tin", "iron"];
  resolveClear(mixed);
  assert.equal(mixed.progress.ore.iron, 4);
  assert.equal(mixed.progress.ore.copper, 0);
  assert.equal(mixed.progress.ore.tin, 0);
  assert.equal(mixed.board[19].every((cell) => cell === null), true);

  const split = createState(createProgress(null), "stone", () => 0);
  split.board[19] = [...Array(5).fill("iron"), ...Array(5).fill("copper")];
  resolveClear(split);
  assert.equal(split.progress.ore.iron, 0);
  assert.equal(split.progress.ore.copper, 0);
  assert.equal(split.board[19].every((cell) => cell === null), true);

  const lean = createState(createProgress(null), "stone", () => 0);
  lean.board[19] = [...Array(6).fill("copper"), ...Array(4).fill("iron")];
  resolveClear(lean);
  assert.equal(lean.progress.ore.copper, 6);
  assert.equal(lean.progress.ore.iron, 0);
  assert.equal(lean.board[19].every((cell) => cell === null), true);
});

test("a wildcard ore mines out of a mixed row and a pure row still clears", () => {
  const progress = createProgress(null);
  const state = createState(progress, "stone", () => 0);
  state.board[18] = ["iron", ...Array(9).fill(null)];
  state.board[19] = [...Array(7).fill("stone"), ...Array(3).fill("copper")];
  resolveClear(state);
  assert.equal(progress.ore.stone, 7);
  assert.equal(progress.ore.copper, 0);
  assert.equal(state.board[19][0], "iron");
  assert.equal(state.board[19][7], "copper");
  assert.equal(state.board[19][9], "copper");
  assert.equal(state.board[18].every((cell) => cell === null), true);

  const pure = createState(createProgress(null), "stone", () => 0);
  pure.board[19] = Array(10).fill("copper");
  resolveClear(pure);
  assert.equal(pure.progress.ore.copper, 10);
  assert.equal(pure.board[19].every((cell) => cell === null), true);

  const stoneRow = createState(createProgress(null), "stone", () => 0);
  stoneRow.board[19] = Array(10).fill("stone");
  resolveClear(stoneRow);
  assert.equal(stoneRow.progress.ore.stone, 10);
});

test("blocks above a hole fall, even when they match their neighbor", () => {
  const stuck = createState(createProgress(null), "stone", () => 0);
  stuck.board[18] = ["stone", "stone", ...Array(8).fill(null)];
  stuck.board[19] = ["stone", "stone", ...Array(8).fill("copper")];
  resolveClear(stuck);
  assert.equal(stuck.progress.ore.stone, 4);
  assert.equal(stuck.board[18][0], null);
  assert.equal(stuck.board[18][1], null);
  assert.equal(stuck.board[19][0], null);
  assert.equal(stuck.board[19][2], "copper");

  const loose = createState(createProgress(null), "stone", () => 0);
  loose.board[18] = ["iron", "copper", ...Array(8).fill(null)];
  loose.board[19] = ["stone", "copper", ...Array(8).fill("copper")];
  resolveClear(loose);
  assert.equal(loose.progress.ore.stone, 1);
  assert.equal(loose.progress.ore.iron, 0);
  assert.equal(loose.progress.ore.copper, 9);
  assert.equal(loose.board[19][0], null);
  assert.equal(loose.board[18][1], null);
  assert.equal(loose.board[19][1], "copper");
});

test("a stack above a cleared row falls, and older holes below stay empty", () => {
  const state = createState(createProgress(null), "stone", () => 0);
  state.board[14] = ["iron", ...Array(9).fill(null)];
  state.board[15] = ["coal", ...Array(9).fill(null)];
  state.board[16] = ["gold", ...Array(9).fill(null)];
  state.board[17] = ["stone", ...Array(9).fill("copper")];
  state.board[18] = [null, "tin", ...Array(8).fill(null)];
  state.board[19] = ["copper", ...Array(9).fill(null)];
  resolveClear(state);
  assert.equal(state.progress.ore.stone, 1);
  assert.equal(state.progress.ore.gold, 0);
  assert.equal(state.progress.ore.copper, 9);
  assert.equal(state.progress.ore.iron, 0);
  assert.equal(state.progress.ore.coal, 0);
  assert.equal(state.board[16][0], "iron");
  assert.equal(state.board[17][0], "coal");
  assert.equal(state.board[15][0], null);
  assert.equal(state.board[18][0], null);
  assert.equal(state.board[18][1], "tin");
  assert.equal(state.board[19][0], "copper");
});

test("each cleared row bursts before the board changes, and a chain waits", () => {
  const progress = createProgress(null);
  const state = createState(progress, "stone", () => 0);
  state.status = "playing";
  state.board[18] = ["stone", ...Array(9).fill(null)];
  state.board[19] = ["stone", ...Array(9).fill("copper")];
  state.piece = { type: "O", ores: ["tin", "tin", "tin", "tin"], r: 0, x: 7, y: 16 };
  const locked = hardDrop(state);
  assert.equal(locked.some((event) => event.type === "burst"), true);
  assert.equal(state.clearPhase, "burst");
  assert.deepEqual(state.clearCells, ["0,19"]);
  assert.equal(progress.ore.stone, 0);

  tick(state, CLEAR_BURST - 1);
  assert.equal(state.board[19][0], "stone");
  assert.equal(state.board[18][0], "stone");

  const committed = tick(state, 1);
  assert.equal(committed.some((event) => event.type === "mine"), true);
  assert.equal(progress.ore.stone, 1);
  assert.equal(state.board[19][0], "stone");
  assert.equal(state.board[18][0], null);
  assert.equal(state.clearPhase, "fall");

  tick(state, CLEAR_FALL - 1);
  assert.equal(state.clearPhase, "fall");
  assert.equal(progress.ore.stone, 1);

  tick(state, 1);
  assert.equal(state.clearPhase, "land");
  assert.equal(progress.ore.stone, 1);
  assert.equal(state.board[19][0], "stone");
  assert.equal(state.clearCells.length, 0);

  tick(state, CLEAR_LAND);
  assert.equal(state.clearPhase, "burst");
  assert.deepEqual(state.clearCells, ["0,19"]);
  assert.equal(state.board[19][0], "stone");

  tick(state, CLEAR_BURST);
  assert.equal(progress.ore.stone, 2);
  assert.equal(state.board[19][0], null);
  assert.equal(state.board[19][1], "copper");
  assert.equal(state.clearPhase, null);
});

test("full rows already eligible clear together, and the holed row waits", () => {
  const progress = createProgress(null);
  const state = createState(progress, "simple", () => 0.5);
  state.status = "playing";
  state.board[16] = [null, ...Array(9).fill("gold")];
  state.board[17] = Array(10).fill("iron");
  state.board[18] = Array(10).fill("copper");
  state.board[19] = Array(10).fill("tin");
  state.piece = { type: "O", ores: ["stone", "stone", "stone", "stone"], r: 0, x: 4, y: 0 };
  hardDrop(state);
  assert.equal(state.clearPlan.length, 3);
  assert.equal(state.clearCells.filter((key) => key.endsWith(",17")).length, 10);
  assert.equal(state.clearCells.filter((key) => key.endsWith(",18")).length, 10);
  assert.equal(state.clearCells.filter((key) => key.endsWith(",19")).length, 10);
  assert.equal(state.clearCells.some((key) => key.endsWith(",16")), false);
  assert.equal(state.board[16][1], "gold");
  assert.equal(state.board[18][0], "copper");

  tick(state, CLEAR_BURST);
  assert.equal(progress.ore.tin, 0);
  assert.equal(progress.ore.copper, 0);
  assert.equal(progress.ore.iron, 0);
  assert.equal(progress.ore.gold, 0);
  assert.equal(state.board[19][0], null);
  assert.equal(state.board[19][1], "gold");
  assert.equal(state.board[16][1], null);
  assert.equal(state.clearPhase, "fall");
  assert.equal(state.falls.some((move) => move.x === 1 && move.from === 16 && move.to === 19), true);

  tick(state, CLEAR_FALL);
  assert.equal(state.clearPhase, "land");
  assert.equal(progress.ore.gold, 0);
  assert.equal(state.board[19][1], "gold");

  tick(state, CLEAR_LAND);
  assert.equal(state.clearPhase, null);
  assert.equal(progress.ore.gold, 0);
  assert.equal(state.board[19][1], "gold");
});

test("the lone block beside a J drops until it rests", () => {
  const state = createState(createProgress(null), "stone", () => 0);
  state.board[16] = [null, null, null, "iron", "iron", ...Array(5).fill(null)];
  state.board[17] = [null, null, null, "iron", ...Array(6).fill(null)];
  state.board[18] = [null, null, null, "iron", ...Array(6).fill(null)];
  state.board[19] = Array(10).fill("copper");
  state.board[19][3] = "stone";
  resolveClear(state);
  assert.equal(state.board[17][3], null);
  assert.equal(state.board[18][3], "iron");
  assert.equal(state.board[19][3], "iron");
  assert.equal(state.board[18][4], null);
  assert.equal(state.board[19][4], "iron");
  assert.equal(state.progress.ore.stone, 1);
  assert.equal(state.progress.ore.iron, 0);
  assert.equal(state.progress.ore.copper, 9);
});

test("holes below the cleared row stay empty", () => {
  const state = createState(createProgress(null), "stone", () => 0);
  state.board[16] = ["iron", ...Array(9).fill(null)];
  state.board[17] = ["stone", ...Array(9).fill("copper")];
  state.board[18] = [null, "tin", ...Array(8).fill(null)];
  state.board[19] = ["gold", ...Array(9).fill(null)];
  resolveClear(state);
  assert.equal(state.progress.ore.stone, 1);
  assert.equal(state.progress.ore.iron, 0);
  assert.equal(state.progress.ore.copper, 9);
  assert.equal(state.progress.ore.gold, 0);
  assert.equal(state.board[17][0], null);
  assert.equal(state.board[18][0], null);
  assert.equal(state.board[18][1], "tin");
  assert.equal(state.board[19][0], "gold");
});

test("a block that falls into a full row clears again", () => {
  const progress = createProgress(null);
  const state = createState(progress, "stone", () => 0);
  state.board[18] = ["stone", ...Array(9).fill(null)];
  state.board[19] = ["stone", ...Array(9).fill("copper")];
  resolveClear(state);
  assert.equal(progress.ore.stone, 2);
  assert.equal(progress.ore.copper, 0);
  assert.equal(state.board[19][0], null);
  assert.equal(state.board[19][1], "copper");
  assert.equal(state.board[18][0], null);
});

test("each pickaxe wildcards different ores", () => {
  const byId = Object.fromEntries(PICKAXES.map((axe) => [axe.id, axe]));
  assert.deepEqual(byId.simple.wildcards, []);
  for (const axe of PICKAXES) {
    if (axe.id === "simple" || axe.id === "bronze" || axe.id === "silver") continue;
    assert.ok(axe.wildcards.includes("stone"), axe.id);
  }
  assert.deepEqual(byId.copper.wildcards, ["stone", "copper"]);
  assert.deepEqual(byId.bronze.wildcards, ["copper", "tin"]);
  assert.deepEqual(byId.iron.wildcards, ["stone", "copper", "iron"]);
  assert.deepEqual(byId.silver.wildcards, ["silver"]);
  assert.deepEqual(byId.mythril.wildcards, ["stone"]);

  const progress = createProgress(null);
  const state = createState(progress, "bronze", () => 0);
  state.board[19] = ["stone", "copper", "tin", "iron", "stone", "copper", "tin", "iron", "stone", "copper"];
  resolveClear(state);
  assert.equal(progress.ore.copper, 6);
  assert.equal(progress.ore.tin, 4);
  assert.equal(progress.ore.stone, 0);
  assert.equal(progress.ore.iron, 0);
  assert.equal(state.board[19][0], "stone");
  assert.equal(state.board[19][1], null);
  assert.equal(state.board[19][3], "iron");
});

test("ores rotate with the mino and four turns restore the piece", () => {
  const ores = ["a", "b", "c", "d"];
  const start = orientedCells("T", ores, 0);
  const turned = orientedCells("T", ores, 1);
  const top = start.find((cell) => cell.ore === "a");
  const moved = turned.find((cell) => cell.ore === "a");
  assert.equal(moved.x, top.x + 1);
  assert.equal(moved.y, top.y + 1);
  const square = orientedCells("O", ores, 0);
  const spun = orientedCells("O", ores, 1);
  const oreA = square.find((cell) => cell.ore === "a");
  const oreMoved = spun.find((cell) => cell.ore === "a");
  assert.notDeepEqual([oreMoved.x, oreMoved.y], [oreA.x, oreA.y]);
  for (const type of ["T", "J", "L", "S", "Z", "I", "O"]) {
    const base = orientedCells(type, ores, 0);
    const full = orientedCells(type, ores, 4);
    assert.deepEqual(
      full.map((cell) => [cell.x, cell.y, cell.ore]),
      base.map((cell) => [cell.x, cell.y, cell.ore]),
    );
  }
});

test("a piece cannot walk through the wall", () => {
  const state = createState(createProgress(null), "simple");
  startShift(state);
  state.piece = { type: "T", ores: ["stone", "stone", "stone", "stone"], r: 0, x: 0, y: 5 };
  assert.equal(tryMove(state, -1, 0), false);
  assert.equal(state.piece.x, 0);
});

test("durability ranks steel highest and stone lowest", () => {
  const byId = Object.fromEntries(PICKAXES.map((axe) => [axe.id, axe]));
  assert.equal(byId.steel.durability, 80);
  assert.equal(byId.mythril.durability, 67);
  assert.equal(byId.silver.durability, 66);
  assert.equal(byId.iron.durability, 56);
  assert.equal(byId.bronze.durability, 48);
  assert.equal(byId.copper.durability, 40);
  assert.equal(byId.simple.durability, 34);
  assert.equal(byId.stone.durability, 18);
  assert.ok(byId.steel.durability > byId.mythril.durability);
  assert.ok(byId.mythril.durability > byId.silver.durability);
  assert.ok(byId.silver.durability > byId.iron.durability);
  assert.ok(byId.iron.durability > byId.bronze.durability);
  assert.ok(byId.bronze.durability > byId.copper.durability);
  assert.ok(byId.copper.durability > byId.simple.durability);
  assert.ok(byId.simple.durability > byId.stone.durability);
});

test("a mine evaluation spends one durability even for many rows", () => {
  const progress = createProgress(null);
  const state = createState(progress, "stone", () => 0);
  assert.equal(state.durabilityLeft, 18);
  assert.equal(state.durabilityMax, 18);
  state.board[17] = Array(10).fill("stone");
  state.board[18] = Array(10).fill("stone");
  state.board[19] = Array(10).fill("stone");
  resolveClear(state);
  assert.equal(state.durabilityLeft, 17);
  assert.equal(state.runOre.stone, 30);
});

test("fall speed follows durability spent, and empty still plays at max speed", () => {
  assert.equal(gravityForSpent(0), 1000);
  assert.equal(gravityForSpent(1), 45);
  assert.ok(gravityForSpent(0.999) > 45);
  assert.ok(gravityForSpent(0.5) < 700);
  assert.ok(gravityForSpent(0.5) > 200);
  const progress = createProgress(null);
  const state = createState(progress, "stone", () => 0);
  startShift(state);
  state.durabilityLeft = 0;
  assert.equal(durabilitySpent(state), 1);
  assert.equal(gravityForSpent(durabilitySpent(state)), 45);
  assert.equal(state.status, "playing");
  const events = tick(state, 100);
  assert.equal(state.status, "playing");
  assert.ok(Array.isArray(events));
});

test("ore ids cover the Melvor line through gold", () => {
  assert.deepEqual(
    ORES.map((ore) => ore.id),
    ["stone", "copper", "tin", "iron", "coal", "silver", "gold"],
  );
});
