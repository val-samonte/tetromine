import "./styles.css";
import {
  ARR,
  DAS,
  ORES,
  ORE_BY_ID,
  PICKAXES,
  axeById,
  costEntries,
  dropList,
  siteById,
  siteForTicket,
  SITES,
} from "./data.js";
import {
  canEnter,
  canForge,
  canPayUnlock,
  createProgress,
  createState,
  enterSite,
  equip,
  forge,
  isUnlocked,
  loadProgress,
  ticketsHeld,
  openSites,
  queueAction,
  resetProgress,
  saveProgress,
  startShift,
  tick,
  unlockSite,
} from "./engine.js";
import { createView } from "./view.js";
import { runCurtain } from "./curtain.js";

const progress = loadProgress();
const view = createView(
  document.querySelector("#shaft"),
  document.querySelector("#next"),
);
const live = document.querySelector("#live");
const settingsButton = document.querySelector("#open-settings");
const soundButton = document.querySelector("#settings-sound");
const settingsModal = document.querySelector("#settings-modal");
const endModal = document.querySelector("#end-modal");
const siteModal = document.querySelector("#site-modal");
const equipAskModal = document.querySelector("#equip-ask-modal");
const unlockAskModal = document.querySelector("#unlock-ask-modal");
const equipPromptModal = document.querySelector("#equip-prompt-modal");
const forgeAskModal = document.querySelector("#forge-ask-modal");
const leaveAskModal = document.querySelector("#leave-ask-modal");
let equipPromptSeen = true;
let equipPromptSiteId = null;
let equipAskId = null;
let unlockAskId = null;
let forgeAskId = null;

const RAINBOW = ["#ff0040", "#ff7a00", "#ffe600", "#00e676", "#00b0ff", "#7c4dff", "#ff4081"];
const RAINBOW_MS = 100;

let screen = "title";
let state = null;
let rainbowAxes = new Set();
let rainbowTick = 0;
let rainbowTimer = 0;
let craftAnim = null;
let settingsOpen = false;
let resetArmed = false;
let resetLeft = 0;
const held = { left: false, right: false, soft: false };
let horizontal = 0;
let dasTime = 0;
let arrTime = 0;
let softTime = 0;

const audio = createAudio();

function announce(text) {
  live.textContent = "";
  live.textContent = text;
}

function pathFor(screenName, siteId) {
  if (screenName === "sites") return "/sites";
  if (screenName === "craft") return "/forge";
  if (screenName === "items") return "/items";
  if (screenName === "shaft" && siteId) return `/play/${encodeURIComponent(siteId)}`;
  return "/";
}

function routeFromPath(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === "") return { screen: "title", path: "/" };
  if (path === "/sites") return { screen: "sites", path };
  if (path === "/forge") return { screen: "craft", path };
  if (path === "/items") return { screen: "items", path };
  const play = path.match(/^\/play\/([^/]+)$/);
  if (!play) return null;
  return { screen: "shaft", path, siteId: decodeURIComponent(play[1]) };
}

function craftableAxes() {
  const had = new Set(progress.had ?? []);
  return PICKAXES.filter((axe) => (
    progress.axes[axe.id] === 0 && canForge(progress, axe.id) && !had.has(axe.id)
  ));
}

function rainbowLabel(text) {
  const label = document.createElement("span");
  for (const [index, ch] of [...text].entries()) {
    const letter = document.createElement("span");
    letter.className = "rainbow-letter";
    letter.dataset.i = String(index);
    letter.textContent = ch === " " ? "\u00a0" : ch;
    label.append(letter);
  }
  return label;
}

function ensureCraftFace(craft) {
  if (craft.querySelector(".craft-wipe") && craft.querySelector(".craft-label")) return;
  craft.replaceChildren();
  const wipe = document.createElement("span");
  wipe.className = "craft-wipe";
  wipe.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "craft-label";
  label.textContent = "New Craftable Pickaxe";
  craft.append(wipe, label);
}

function paintRainbow() {
  const craft = document.querySelector("#end-craft");
  if (craft?.querySelector(".rainbow-letter")) ensureCraftFace(craft);
  for (const letter of document.querySelectorAll(".rainbow-letter")) {
    if (craft?.contains(letter)) continue;
    const index = Number(letter.dataset.i);
    letter.style.color = RAINBOW[(rainbowTick + index) % RAINBOW.length];
  }
}

function stopCraftWipe() {
  if (craftAnim) craftAnim.cancel();
  craftAnim = null;
}

function paintCraftStrip(wipe) {
  const bands = [...RAINBOW, ...RAINBOW];
  const stops = bands.flatMap((color, index) => {
    const start = (index / bands.length) * 100;
    const end = ((index + 1) / bands.length) * 100;
    return [`${color} ${start}%`, `${color} ${end}%`];
  });
  wipe.style.width = `${bands.length * 75}%`;
  wipe.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
}

function playCraftWipe() {
  const craft = document.querySelector("#end-craft");
  const wipe = craft?.querySelector(".craft-wipe");
  if (!craft || craft.hidden || !wipe) {
    stopCraftWipe();
    return;
  }
  paintCraftStrip(wipe);
  craft.style.color = "#000";
  craftAnim = wipe.animate(
    [
      { transform: "skewX(-16deg) translateX(0)" },
      { transform: "skewX(-16deg) translateX(-50%)" },
    ],
    { duration: 520 * RAINBOW.length, easing: "linear", iterations: Infinity },
  );
}

function startCraftWipe() {
  const craft = document.querySelector("#end-craft");
  if (!craft || craft.hidden || craftAnim) return;
  ensureCraftFace(craft);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    craft.style.backgroundColor = RAINBOW[0];
    return;
  }
  playCraftWipe();
}

function stopRainbow() {
  if (!rainbowTimer) return;
  clearInterval(rainbowTimer);
  rainbowTimer = 0;
}

function startRainbow() {
  paintRainbow();
  startCraftWipe();
  if (rainbowTimer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  rainbowTimer = window.setInterval(() => {
    rainbowTick += 1;
    paintRainbow();
  }, RAINBOW_MS);
}

function unseenSites() {
  return openSites(progress).filter((site) => !progress.played.includes(site.id));
}

function setDockText(button, text, rainbow) {
  if (rainbow) button.replaceChildren(rainbowLabel(text));
  else button.textContent = text;
}

function paintNav() {
  const play = document.querySelector("[data-dock='sites']");
  const craft = document.querySelector("[data-dock='craft']");
  const onPlay = play.getAttribute("aria-current") === "page";
  const onCraft = craft.getAttribute("aria-current") === "page";
  setDockText(play, "Play", !onPlay && unseenSites().length > 0);
  setDockText(craft, "Craft", !onCraft && craftableAxes().length > 0);
}

function syncRainbow() {
  if (document.querySelector(".rainbow-letter")) startRainbow();
  else stopRainbow();
}

function showScreen(next) {
  closeSiteInfo();
  closeUnlockAsk();
  closeForgeAsk();
  closeLeaveAsk();
  if (next !== "craft") rainbowAxes = new Set();
  screen = next;
  document.querySelectorAll("[data-screen]").forEach((section) => {
    section.hidden = section.dataset.screen !== next;
  });
  settingsButton.hidden = next === "title" || next === "shaft";
  const dock = document.querySelector("#dock");
  const menu = next === "sites" || next === "craft" || next === "items";
  dock.hidden = !menu;
  settingsButton.classList.toggle("in-dock", menu);
  dock.querySelectorAll("[data-dock]").forEach((button) => {
    if (button.dataset.dock === next) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (next === "sites") renderSites();
  if (next === "craft") renderCraft();
  if (next === "items") renderItems();
  paintNav();
  syncRainbow();
  settleBrokenEquip();
  maybePromptEquip();
  scrollTop();
}

function scrollTop() {
  window.scrollTo(0, 0);
}

function focusScreen(next) {
  if (next === "title") document.querySelector("#start-digging")?.focus();
}

let curtainQueue = Promise.resolve();

function go(next, options = {}) {
  const job = curtainQueue.then(() => commit(next, options));
  curtainQueue = job.then(
    () => {},
    () => {},
  );
  return job;
}

function commit(next, options) {
  let target = next;
  let siteId = options.siteId ?? (target === "shaft" ? activeSite()?.id : undefined);
  let url = pathFor(target, siteId);
  let historyMode = options.history ?? "push";

  if (options.fromPop) {
    const route = routeFromPath(location.pathname);
    if (!route) {
      target = "title";
      url = "/";
      historyMode = "replace";
    } else if (route.screen === "shaft") {
      const alive = state && state.status !== "left" && activeSite()?.id === route.siteId;
      if (!alive) {
        target = "sites";
        url = "/sites";
        historyMode = "replace";
      } else {
        target = "shaft";
        url = route.path;
        historyMode = "none";
      }
    } else {
      target = route.screen;
      url = route.path;
      historyMode = "none";
    }
  }

  if (target === screen && location.pathname === url && historyMode !== "replace") {
    focusScreen(target);
    return Promise.resolve();
  }

  const apply = () => {
    if (screen === "shaft" && target !== "shaft" && state && state.status !== "left") {
      state.status = "left";
      held.left = false;
      held.right = false;
      held.soft = false;
      clearStick();
      hideEnd();
    }
    if (screen === "shaft" && (target === "sites" || target === "craft" || target === "items")) {
      equipPromptSeen = false;
    }
    closeSettings();
    showScreen(target);
    if (historyMode === "push" && location.pathname !== url) history.pushState({ screen: target }, "", url);
    else if (historyMode === "replace") history.replaceState({ screen: target }, "", url);
  };

  if (options.immediate) {
    apply();
    scrollTop();
    focusScreen(target);
    return Promise.resolve();
  }
  return runCurtain(apply).then(() => {
    scrollTop();
    focusScreen(target);
  });
}

function boot() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const route = routeFromPath(location.pathname);
  if (!route || route.screen === "shaft") {
    const fallback = route?.screen === "shaft" ? "sites" : "title";
    history.replaceState({ screen: fallback }, "", pathFor(fallback));
    showScreen(fallback);
    focusScreen(fallback);
    return;
  }
  history.replaceState({ screen: route.screen }, "", route.path);
  showScreen(route.screen);
  focusScreen(route.screen);
}

function renderItems() {
  const axes = document.querySelector("#item-axes");
  axes.replaceChildren();
  for (const axe of PICKAXES.toReversed()) {
    if (axe.id === "simple" || !progress.axes[axe.id]) continue;
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "item-axe";
    button.dataset.equip = axe.id;
    if (progress.equipped === axe.id) button.setAttribute("aria-current", "true");
    const head = document.createElement("span");
    head.className = "item-axe-name";
    const name = document.createElement("span");
    name.textContent = axe.name;
    head.append(name);
    if (progress.equipped === axe.id) {
      const mark = document.createElement("span");
      mark.className = "equipped";
      mark.textContent = "Equipped";
      head.append(mark);
    }
    const qty = document.createElement("span");
    qty.className = "qty";
    qty.textContent = `x${progress.axes[axe.id]}`;
    head.append(qty);
    const strong = document.createElement("span");
    strong.className = "item-strong";
    const label = document.createElement("span");
    label.className = "strong-label";
    label.textContent = "Strong against";
    const wild = document.createElement("span");
    wild.className = "item-wild";
    for (const id of axe.wildcards) {
      const ore = ORE_BY_ID[id];
      const bit = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.className = "swatch";
      swatch.style.setProperty("--swatch", ore.fill);
      const oreName = document.createElement("span");
      oreName.textContent = ore.name;
      bit.append(swatch, oreName);
      wild.append(bit);
    }
    strong.append(label, wild);
    button.append(head, strong);
    item.append(button);
    axes.append(item);
  }

  const ores = document.querySelector("#item-ores");
  ores.replaceChildren();
  for (const ore of ORES.toReversed()) {
    if (!progress.ore[ore.id]) continue;
    const item = document.createElement("li");
    const swatch = document.createElement("i");
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", ore.fill);
    const name = document.createElement("span");
    name.textContent = ore.name;
    const qty = document.createElement("span");
    qty.className = "qty";
    qty.textContent = String(progress.ore[ore.id]);
    item.append(swatch, name, qty);
    ores.append(item);
  }

  axes.hidden = axes.childElementCount === 0;
  ores.hidden = ores.childElementCount === 0;
  axes.previousElementSibling.hidden = axes.hidden;
  ores.previousElementSibling.hidden = ores.hidden;
  const empty = axes.hidden && ores.hidden;
  document.querySelector("#items-empty").hidden = !empty;
  document.querySelector("[data-screen='items']").classList.toggle("items-blank", empty);
}

function veinBar(drops) {
  const bar = document.createElement("div");
  bar.className = "vein";
  for (const { ore, pct } of dropList(drops)) {
    const segment = document.createElement("i");
    segment.style.setProperty("--w", `${pct}%`);
    segment.style.setProperty("--c", ore.fill);
    bar.append(segment);
  }
  return bar;
}

function infoMark() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9");
  const mark = document.createElementNS("http://www.w3.org/2000/svg", "text");
  mark.setAttribute("x", "12");
  mark.setAttribute("y", "16.2");
  mark.setAttribute("text-anchor", "middle");
  mark.textContent = "?";
  svg.append(circle, mark);
  return svg;
}

function appendOrePercents(list, drops) {
  for (const { ore, pct } of dropList(drops)) {
    const item = document.createElement("li");
    const swatch = document.createElement("i");
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", ore.fill);
    const name = document.createElement("span");
    name.textContent = ore.name;
    const frac = document.createElement("span");
    frac.className = "frac";
    frac.textContent = `${pct}%`;
    item.append(swatch, name, frac);
    list.append(item);
  }
}

function openSiteInfo(siteId) {
  const site = siteById(siteId);
  if (!site) return;
  document.querySelector("#site-info-title").textContent = site.name;
  const body = document.querySelector("#site-info-body");
  body.replaceChildren();

  const parts = [];
  if (site.cost && !isUnlocked(progress, site.id)) {
    const unlockLabel = document.createElement("p");
    unlockLabel.className = "info-label";
    unlockLabel.textContent = "Unlock cost";
    const unlock = document.createElement("ul");
    unlock.className = "info-ores";
    for (const { ore, need } of costEntries(site.cost)) {
      const item = document.createElement("li");
      const swatch = document.createElement("i");
      swatch.className = "swatch";
      swatch.style.setProperty("--swatch", ore.fill);
      const name = document.createElement("span");
      name.textContent = ore.name;
      const frac = document.createElement("span");
      frac.className = "frac";
      frac.textContent = String(need);
      item.append(swatch, name, frac);
      unlock.append(item);
    }
    parts.push(unlockLabel, unlock);
  }

  const resourceLabel = document.createElement("p");
  resourceLabel.className = "info-label";
  resourceLabel.textContent = "Resources";
  const resources = document.createElement("ul");
  resources.className = "info-ores";
  appendOrePercents(resources, axeById(site.tickets[0]).drops);
  body.append(...parts, resourceLabel, resources);
  siteModal.hidden = false;
  document.querySelector("#site-info-close").focus();
}

function closeSiteInfo() {
  siteModal.hidden = true;
}

function openAxeInfo(axeId) {
  const axe = axeById(axeId);
  if (!axe) return;
  document.querySelector("#site-info-title").textContent = axe.name;
  const body = document.querySelector("#site-info-body");
  body.replaceChildren();
  const label = document.createElement("p");
  label.className = "info-label";
  label.textContent = "Strong against";
  const list = document.createElement("ul");
  list.className = "info-ores";
  if (axe.wildcards.length === 0) {
    const item = document.createElement("li");
    item.textContent = "None";
    list.append(item);
  } else {
    for (const id of axe.wildcards) {
      const ore = ORES.find((item) => item.id === id);
      const item = document.createElement("li");
      const swatch = document.createElement("i");
      swatch.className = "swatch";
      swatch.style.setProperty("--swatch", ore.fill);
      const name = document.createElement("span");
      name.textContent = ore.name;
      item.append(swatch, name);
      list.append(item);
    }
  }
  body.append(label, list);
  siteModal.hidden = false;
  document.querySelector("#site-info-close").focus();
}

function activeSite() {
  if (state?.siteId) {
    const site = siteById(state.siteId);
    if (site) return site;
  }
  return state?.ticket ? siteForTicket(state.ticket) : undefined;
}

function renderSites() {
  const unlockable = SITES.toReversed().filter((site) => canPayUnlock(progress, site.id));
  const unlocked = SITES.toReversed().filter((site) => isUnlocked(progress, site.id));
  const locked = SITES.filter((site) => !isUnlocked(progress, site.id) && !canPayUnlock(progress, site.id));
  fillSiteList(document.querySelector("#site-open"), [...unlockable, ...unlocked]);
  fillSiteList(document.querySelector("#site-locked"), locked);
}

function fillSiteList(list, sites) {
  list.replaceChildren();
  for (const site of sites) {
    const unlocked = isUnlocked(progress, site.id);
    const payable = canPayUnlock(progress, site.id);
    const item = document.createElement("li");
    if (!unlocked && !payable) item.classList.add("dim");
    const copy = document.createElement("div");
    const head = document.createElement("div");
    head.className = "site-head";
    const name = document.createElement("h2");
    name.className = "site-name";
    if (payable || (unlocked && !progress.played.includes(site.id))) name.append(rainbowLabel(site.name));
    else name.textContent = site.name;
    const info = document.createElement("button");
    info.type = "button";
    info.className = "info-btn";
    info.dataset.info = site.id;
    info.setAttribute("aria-label", `${site.name} info`);
    info.append(infoMark());
    head.append(name, info);
    copy.append(head, veinBar(axeById(site.tickets[0]).drops));
    if (!unlocked && site.cost) {
      for (const { ore, need } of costEntries(site.cost)) {
        const row = document.createElement("p");
        row.className = "cost-row";
        const swatch = document.createElement("i");
        swatch.className = "swatch";
        swatch.style.setProperty("--swatch", ore.fill);
        const mat = document.createElement("span");
        mat.textContent = ore.name;
        const frac = document.createElement("span");
        frac.className = "frac";
        frac.textContent = `${progress.ore[ore.id]}/${need}`;
        row.append(swatch, mat, frac);
        copy.append(row);
      }
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "solid-btn";
    if (unlocked) {
      button.dataset.site = site.id;
      button.textContent = "Enter";
      button.disabled = !canEnter(progress, site.id);
    } else {
      button.dataset.unlock = site.id;
      button.textContent = "Unlock";
      button.disabled = !canPayUnlock(progress, site.id);
    }
    item.append(copy, button);
    list.append(item);
  }
  list.hidden = list.childElementCount === 0;
}

function renderCraft() {
  const axes = PICKAXES.filter((axe) => axe.cost);
  const fresh = new Set(craftableAxes().map((axe) => axe.id));
  fillAxeList(document.querySelector("#axe-list"), axes.toReversed().filter((axe) => canForge(progress, axe.id)), fresh);
  fillAxeList(document.querySelector("#axe-locked"), axes.filter((axe) => !canForge(progress, axe.id)), fresh);
  paintNav();
  syncRainbow();
}

function fillAxeList(list, axes, fresh) {
  list.replaceChildren();
  for (const axe of axes) {
    const item = document.createElement("li");
    if (!canForge(progress, axe.id)) item.classList.add("dim");
    const copy = document.createElement("div");
    const name = document.createElement("h2");
    name.className = "axe-name";
    const label = fresh.has(axe.id) ? rainbowLabel(axe.name) : document.createElement("span");
    if (!fresh.has(axe.id)) label.textContent = axe.name;
    const head = document.createElement("div");
    head.className = "site-head";
    const info = document.createElement("button");
    info.type = "button";
    info.className = "info-btn";
    info.dataset.axeInfo = axe.id;
    info.setAttribute("aria-label", `${axe.name} info`);
    info.append(infoMark());
    head.append(label, info);
    if (progress.axes[axe.id] > 0) {
      const qty = document.createElement("span");
      qty.className = "qty";
      qty.textContent = `x${progress.axes[axe.id]}`;
      name.append(qty);
    }
    name.prepend(head);
    copy.append(name);
    for (const { ore, need } of costEntries(axe.cost)) {
      const row = document.createElement("p");
      row.className = "cost-row";
      const swatch = document.createElement("i");
      swatch.className = "swatch";
      swatch.style.setProperty("--swatch", ore.fill);
      const mat = document.createElement("span");
      mat.textContent = ore.name;
      const frac = document.createElement("span");
      frac.className = "frac";
      frac.textContent = `${progress.ore[ore.id]}/${need}`;
      row.append(swatch, mat, frac);
      copy.append(row);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "solid-btn";
    button.dataset.axe = axe.id;
    button.textContent = `Forge ${axe.name}`;
    button.disabled = !canForge(progress, axe.id);
    item.append(copy, button);
    list.append(item);
  }
  list.hidden = list.childElementCount === 0;
}

function sparePickaxes() {
  const equipped = progress.equipped || "simple";
  return PICKAXES.filter((axe) => axe.id !== "simple" && axe.id !== equipped && ticketsHeld(progress, axe.id) >= 1);
}

function settleBrokenEquip() {
  const menu = screen === "sites" || screen === "craft" || screen === "items";
  if (!menu) return;
  const equipped = progress.equipped || "simple";
  if (equipped === "simple" || ticketsHeld(progress, equipped) >= 1) return;
  if (sparePickaxes().length > 0) return;
  progress.equipped = "simple";
  saveProgress(progress);
}

function needsEquipPrompt() {
  const equipped = progress.equipped || "simple";
  if (equipped === "simple" || ticketsHeld(progress, equipped) >= 1) return false;
  return sparePickaxes().length > 0;
}

function maybePromptEquip() {
  const menu = screen === "sites" || screen === "craft" || screen === "items";
  if (!menu || !needsEquipPrompt()) {
    closeEquipPrompt();
    return;
  }
  if (equipPromptSeen) return;
  openEquipPrompt(null);
}

function openEquipPrompt(siteId) {
  equipPromptSeen = true;
  equipPromptSiteId = siteId;
  document.querySelector("#equip-prompt-simple").hidden = !siteId;
  document.querySelector("#equip-prompt-note").hidden = !siteId;
  equipPromptModal.hidden = false;
  document.querySelector("#equip-prompt-ok").focus();
}

function closeEquipPrompt() {
  equipPromptSiteId = null;
  document.querySelector("#equip-prompt-simple").hidden = true;
  document.querySelector("#equip-prompt-note").hidden = true;
  equipPromptModal.hidden = true;
}

function acceptEquipPrompt() {
  closeEquipPrompt();
  if (screen !== "items") go("items");
}

function proceedWithSimple() {
  const siteId = equipPromptSiteId;
  closeEquipPrompt();
  if (!equip(progress, "simple")) return;
  if (siteId) begin(siteId);
}

function openEquipAsk(axeId) {
  equipAskId = axeId;
  const next = axeById(axeId);
  const current = axeById(progress.equipped || "simple");
  document.querySelector("#equip-ask-title").textContent = next.name;
  document.querySelector("#equip-ask-copy").textContent = `Equip ${next.name}?`;
  document.querySelector("#equip-ask-no").textContent = `Keep ${current.name}`;
  equipAskModal.hidden = false;
  document.querySelector("#equip-ask-yes").focus();
}

function closeEquipAsk() {
  equipAskModal.hidden = true;
  equipAskId = null;
}

function openForgeAsk(axeId) {
  const axe = axeById(axeId);
  if (!axe) return;
  forgeAskId = axe.id;
  document.querySelector("#forge-ask-title").textContent = axe.name;
  document.querySelector("#forge-ask-copy").textContent = "Want to forge a new pickaxe?";
  forgeAskModal.hidden = false;
  document.querySelector("#forge-ask-yes").focus();
}

function closeForgeAsk() {
  forgeAskModal.hidden = true;
  forgeAskId = null;
}

function openLeaveAsk() {
  leaveAskModal.hidden = false;
  document.querySelector("#leave-ask-yes").focus();
}

function closeLeaveAsk() {
  leaveAskModal.hidden = true;
}

function acceptForgeAsk() {
  const axeId = forgeAskId;
  closeForgeAsk();
  if (!axeId || !forge(progress, axeId)) return;
  const axe = axeById(axeId);
  audio.blip(330, 0.06);
  audio.blip(494, 0.08);
  announce(`Forged ${axe.name}.`);
  const site = activeSite();
  if (site) begin(site.id);
}

function openUnlockAsk(siteId) {
  const site = siteById(siteId);
  if (!site) return;
  unlockAskId = site.id;
  document.querySelector("#unlock-ask-title").textContent = site.name;
  document.querySelector("#unlock-ask-copy").textContent = `Proceed to ${site.name}?`;
  unlockAskModal.hidden = false;
  document.querySelector("#unlock-ask-yes").focus();
}

function closeUnlockAsk() {
  unlockAskModal.hidden = true;
  unlockAskId = null;
}

function begin(siteId) {
  closeSiteInfo();
  const site = enterSite(progress, siteId);
  if (!site) {
    renderSites();
    return;
  }
  state = createState(progress, site.ticket, Math.random, axeById(site.tickets[0]).drops);
  state.siteId = site.id;
  startShift(state);
  document.querySelector("#shaft-site").textContent = site.name;
  renderShaftHead();
  renderShaftPack();
  hideEnd();
  closeSettings();
  go("shaft", { siteId: site.id });
  document.activeElement?.blur();
}

function renderShaftHead() {
  const axe = axeById(state.ticket);
  document.querySelector("#shaft-axe").textContent = axe.name;
  const list = document.querySelector("#shaft-strong");
  const label = list.previousElementSibling;
  list.replaceChildren();
  if (axe.wildcards.length === 0) {
    list.hidden = true;
    if (label) label.hidden = true;
    return;
  }
  list.hidden = false;
  if (label) label.hidden = false;
  for (const id of axe.wildcards) {
    const ore = ORES.find((item) => item.id === id);
    const item = document.createElement("li");
    item.setAttribute("aria-label", ore.name);
    const swatch = document.createElement("i");
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", ore.fill);
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch);
    list.append(item);
  }
}

function oreCountLabel(amount) {
  const portrait = window.matchMedia("(max-width: 760px) and (orientation: portrait)").matches;
  if (!portrait || amount < 1000) return String(amount);
  const scaled = Math.round(amount / 100) / 10;
  return `${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}k`;
}

function renderShaftPack() {
  const list = document.querySelector("#shaft-pack");
  list.replaceChildren();
  const drops = state.drops ?? axeById(activeSite()?.tickets?.[0])?.drops;
  for (const { ore } of dropList(drops)) {
    const item = document.createElement("li");
    const swatch = document.createElement("i");
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", ore.fill);
    const lead = document.createElement("span");
    lead.className = "pack-name";
    const name = document.createElement("span");
    name.textContent = ore.name;
    const qty = document.createElement("span");
    qty.className = "qty";
    qty.dataset.ore = ore.id;
    qty.textContent = oreCountLabel(progress.ore[ore.id]);
    lead.append(swatch, name);
    item.append(lead, qty);
    item.setAttribute("aria-label", `${ore.name} ${progress.ore[ore.id]}`);
    list.append(item);
  }
}

function syncShaft() {
  for (const qty of document.querySelectorAll("#shaft-pack [data-ore]")) {
    const amount = progress.ore[qty.dataset.ore];
    qty.textContent = oreCountLabel(amount);
    const ore = ORES.find((item) => item.id === qty.dataset.ore);
    if (ore) qty.closest("li")?.setAttribute("aria-label", `${ore.name} ${amount}`);
  }
}

function renderRunResult() {
  const list = document.querySelector("#end-result");
  list.replaceChildren();
  const farmed = state.runOre ?? {};
  for (const ore of ORES.toReversed()) {
    const amount = farmed[ore.id] ?? 0;
    if (amount <= 0) continue;
    const item = document.createElement("li");
    const lead = document.createElement("span");
    lead.className = "pack-name";
    const swatch = document.createElement("i");
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", ore.fill);
    const name = document.createElement("span");
    name.textContent = ore.name;
    const qty = document.createElement("span");
    qty.className = "qty";
    qty.textContent = String(amount);
    lead.append(swatch, name);
    item.append(lead, qty);
    list.append(item);
  }
  document.querySelector("#end-result-label").hidden = list.childElementCount === 0;
}

function hideEnd() {
  endModal.hidden = true;
  stopCraftWipe();
}

function showOver() {
  const site = activeSite();
  document.querySelector("#end-title").textContent = site.name;
  renderRunResult();
  const again = document.querySelector("#end-again");
  const held = ticketsHeld(progress, state.ticket);
  if (canEnter(progress, site.id) || (held === 0 && canForge(progress, state.ticket))) {
    again.hidden = false;
    again.textContent = "Try again";
    again.dataset.mode = held === 0 && !canEnter(progress, site.id) ? "forge" : "enter";
  } else {
    again.hidden = true;
    again.dataset.mode = "";
  }
  const craft = document.querySelector("#end-craft");
  craft.hidden = craftableAxes().length === 0;
  if (!craft.hidden) {
    ensureCraftFace(craft);
    craft.querySelector(".craft-label").textContent = "New Craftable Pickaxe";
    craft.style.color = "#000";
    startRainbow();
  }
  endModal.hidden = false;
  if (!craft.hidden) craft.focus({ focusVisible: true });
  else (again.hidden ? document.querySelector("#end-back") : again).focus({ focusVisible: true });
}

function openSettings() {
  settingsOpen = true;
  settingsModal.hidden = false;
  document.querySelector("#settings-close").focus();
}

function closeSettings() {
  settingsOpen = false;
  settingsModal.hidden = true;
  resetArmed = false;
  document.querySelector("#settings-erase").textContent = "Erase progress";
}

function leaveShaft() {
  if (state) state.status = "left";
  held.left = false;
  held.right = false;
  held.soft = false;
  clearStick();
  hideEnd();
  closeSettings();
  go("sites");
}

function pressHorizontal(direction) {
  held[direction < 0 ? "left" : "right"] = true;
  horizontal = direction;
  dasTime = 0;
  arrTime = 0;
  if (state?.status === "playing") {
    const result = queueAction(state, direction < 0 ? "left" : "right");
    if (result.accepted) audio.blip(740, 0.02);
  }
}

function releaseHorizontal(direction) {
  held[direction < 0 ? "left" : "right"] = false;
  if (held.left) pressHorizontal(-1);
  else if (held.right) pressHorizontal(1);
  else horizontal = 0;
}

function actOnce(action) {
  if (!state || state.status !== "playing") return;
  const result = queueAction(state, action);
  for (const event of result.events) handleEvent(event);
  if (!result.accepted) return;
  if (action === "cw" || action === "ccw") audio.blip(520, 0.03);
}

function handleEvent(event) {
  view.onEvent(event);
  if (event.type === "locked") audio.blip(150, 0.05);
  if (event.type === "mixed") audio.blip(90, 0.08);
  if (event.type === "burst") audio.blip(210 + event.chain * 90, 0.08);
  if (event.type === "mine") {
    const chord = event.lines >= 4 ? 660 : event.lines === 3 ? 554 : 440;
    audio.blip(chord, 0.12);
    if (event.groups.length === 0) {
      announce("The row paid nothing.");
      return;
    }
    const said = event.groups
      .map((group) => `${group.amount} ${axeName(group.ore)}`)
      .join(", ");
    announce(`Mined ${said}.`);
  }
  if (event.type === "over") showOver();
}

function axeName(id) {
  return ORES.find((ore) => ore.id === id)?.name ?? id;
}

function updateHeld(dt) {
  if (!state || state.status !== "playing") return;
  if (horizontal !== 0 && (held.left || held.right)) {
    dasTime += dt;
    if (dasTime >= DAS) {
      arrTime += dt;
      while (arrTime >= ARR) {
        arrTime -= ARR;
        const result = queueAction(state, horizontal < 0 ? "left" : "right");
        if (!result.accepted) break;
      }
    }
  }
  if (held.soft) {
    softTime += dt;
    while (softTime >= 45) {
      softTime -= 45;
      const result = queueAction(state, "soft");
      if (!result.accepted) break;
    }
  } else {
    softTime = 0;
  }
}

document.querySelector("#start-digging").addEventListener("click", () => {
  audio.unlock();
  go("sites");
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => go(button.dataset.go));
});

for (const list of document.querySelectorAll("#site-locked, #site-open")) list.addEventListener("click", (event) => {
  const info = event.target.closest("button[data-info]");
  if (info) {
    openSiteInfo(info.dataset.info);
    return;
  }
  const unlock = event.target.closest("button[data-unlock]");
  if (unlock && !unlock.disabled) {
    audio.unlock();
    if (unlockSite(progress, unlock.dataset.unlock)) {
      const siteId = unlock.dataset.unlock;
      renderSites();
      paintNav();
      syncRainbow();
      openUnlockAsk(siteId);
    }
    return;
  }
  const button = event.target.closest("button[data-site]");
  if (!button || button.disabled) return;
  const site = siteById(button.dataset.site);
  audio.unlock();
  begin(site.id);
});

for (const list of document.querySelectorAll("#axe-list, #axe-locked")) list.addEventListener("click", (event) => {
  const info = event.target.closest("button[data-axe-info]");
  if (info) {
    openAxeInfo(info.dataset.axeInfo);
    return;
  }
  const button = event.target.closest("button[data-axe]");
  if (!button || button.disabled) return;
  audio.unlock();
  const axeId = button.dataset.axe;
  const equipped = progress.equipped || "simple";
  const higher = PICKAXES.findIndex((axe) => axe.id === axeId) > PICKAXES.findIndex((axe) => axe.id === equipped);
  if (!forge(progress, axeId)) return;
  audio.blip(330, 0.06);
  audio.blip(494, 0.08);
  const axe = axeById(axeId);
  announce(`Forged ${axe.name}.`);
  renderCraft();
  if (higher) openEquipAsk(axeId);
});

document.querySelector("#settings-erase").addEventListener("click", () => {
  const button = document.querySelector("#settings-erase");
  if (!resetArmed) {
    resetArmed = true;
    resetLeft = 4000;
    button.textContent = "Erase progress?";
    return;
  }
  resetProgress(progress);
  resetArmed = false;
  button.textContent = "Erase progress";
  if (state) state.status = "left";
  closeSettings();
  hideEnd();
  if (screen === "shaft") go("sites");
  else if (screen === "craft") renderCraft();
  else if (screen === "sites") renderSites();
  else if (screen === "items") renderItems();
});

document.querySelector("#end-back").addEventListener("click", leaveShaft);
document.querySelector("#end-craft").addEventListener("click", () => {
  rainbowAxes = new Set(craftableAxes().map((axe) => axe.id));
  if (state) state.status = "left";
  held.left = false;
  held.right = false;
  held.soft = false;
  clearStick();
  hideEnd();
  closeSettings();
  go("craft");
});
document.querySelector("#end-again").addEventListener("click", () => {
  const site = activeSite();
  if (document.querySelector("#end-again").dataset.mode === "forge") {
    openForgeAsk(state.ticket);
    return;
  }
  begin(site.id);
});
document.querySelector("#item-axes").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-equip]");
  if (!button) return;
  if (!equip(progress, button.dataset.equip)) return;
  audio.unlock();
  audio.blip(520, 0.04);
  renderItems();
  settleBrokenEquip();
  maybePromptEquip();
});
document.querySelector("#forge-ask-yes").addEventListener("click", acceptForgeAsk);
document.querySelector("#forge-ask-no").addEventListener("click", closeForgeAsk);
forgeAskModal.addEventListener("click", (event) => {
  if (event.target === forgeAskModal) closeForgeAsk();
});
document.querySelector("#unlock-ask-yes").addEventListener("click", () => {
  const siteId = unlockAskId;
  closeUnlockAsk();
  if (!siteId) return;
  if (canEnter(progress, siteId)) begin(siteId);
  else if (needsEquipPrompt()) openEquipPrompt(siteId);
  else {
    equip(progress, "simple");
    begin(siteId);
  }
});
document.querySelector("#unlock-ask-no").addEventListener("click", closeUnlockAsk);
unlockAskModal.addEventListener("click", (event) => {
  if (event.target === unlockAskModal) closeUnlockAsk();
});
document.querySelector("#equip-ask-yes").addEventListener("click", () => {
  if (equipAskId) equip(progress, equipAskId);
  closeEquipAsk();
  if (screen === "items") renderItems();
});
document.querySelector("#equip-ask-no").addEventListener("click", closeEquipAsk);
equipAskModal.addEventListener("click", (event) => {
  if (event.target === equipAskModal) closeEquipAsk();
});
document.querySelector("#equip-prompt-ok").addEventListener("click", acceptEquipPrompt);
document.querySelector("#equip-prompt-simple").addEventListener("click", proceedWithSimple);
equipPromptModal.addEventListener("click", (event) => {
  if (event.target === equipPromptModal) acceptEquipPrompt();
});
document.querySelector("#site-info-close").addEventListener("click", closeSiteInfo);
siteModal.addEventListener("click", (event) => {
  if (event.target === siteModal) closeSiteInfo();
});
document.querySelector("#shaft-leave").addEventListener("click", openLeaveAsk);
document.querySelector("#leave-ask-yes").addEventListener("click", leaveShaft);
document.querySelector("#leave-ask-no").addEventListener("click", closeLeaveAsk);
leaveAskModal.addEventListener("click", (event) => {
  if (event.target === leaveAskModal) closeLeaveAsk();
});
document.querySelector("#shaft-settings").addEventListener("click", () => {
  audio.unlock();
  openSettings();
});
document.querySelector("#open-settings").addEventListener("click", () => {
  audio.unlock();
  openSettings();
});
document.querySelector("#settings-close").addEventListener("click", closeSettings);

soundButton.addEventListener("click", () => {
  progress.sound = !progress.sound;
  soundButton.setAttribute("aria-pressed", String(progress.sound));
  saveProgress(progress);
  if (progress.sound) audio.unlock();
});
soundButton.setAttribute("aria-pressed", String(progress.sound));

document.querySelectorAll(".touch button").forEach((button) => {
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    audio.unlock();
    actOnce(button.dataset.act);
  });
});

const stick = document.querySelector(".touch-stick");
const STICK_DEAD = 0.22;
let stickDir = null;

function clearStick() {
  if (stickDir === "left") releaseHorizontal(-1);
  else if (stickDir === "right") releaseHorizontal(1);
  else if (stickDir === "soft") held.soft = false;
  stickDir = null;
  stick?.querySelectorAll(".on").forEach((part) => part.classList.remove("on"));
}

function dirFromStick(event) {
  const rect = stick.getBoundingClientRect();
  const lx = event.clientX - (rect.left + rect.width / 2);
  const ly = event.clientY - (rect.top + rect.height / 2);
  const radius = Math.min(rect.width, rect.height) / 2;
  if (radius <= 0 || Math.hypot(lx, ly) < radius * STICK_DEAD) return null;
  if (Math.abs(lx) >= Math.abs(ly)) return lx < 0 ? "left" : "right";
  return ly < 0 ? "ccw" : "soft";
}

function applyStick(dir) {
  if (dir === stickDir) return;
  if (stickDir === "left") releaseHorizontal(-1);
  else if (stickDir === "right") releaseHorizontal(1);
  else if (stickDir === "soft") held.soft = false;
  stickDir = dir;
  stick.querySelectorAll("[data-dir]").forEach((part) => {
    part.classList.toggle("on", part.dataset.dir === dir);
  });
  if (!dir) return;
  audio.unlock();
  if (dir === "left") pressHorizontal(-1);
  else if (dir === "right") pressHorizontal(1);
  else if (dir === "soft") {
    held.soft = true;
    softTime = 45;
  } else actOnce("ccw");
}

if (stick) {
  stick.addEventListener("contextmenu", (event) => event.preventDefault());
  stick.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    stick.setPointerCapture(event.pointerId);
    applyStick(dirFromStick(event));
  });
  stick.addEventListener("pointermove", (event) => {
    if (!stick.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    applyStick(dirFromStick(event));
  });
  const endStick = (event) => {
    event.preventDefault();
    if (stick.hasPointerCapture(event.pointerId)) stick.releasePointerCapture(event.pointerId);
    applyStick(null);
  };
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);
  stick.addEventListener("lostpointercapture", () => applyStick(null));
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    if (!equipPromptModal.hidden) acceptEquipPrompt();
    else if (!forgeAskModal.hidden) closeForgeAsk();
    else if (!leaveAskModal.hidden) closeLeaveAsk();
    else if (!unlockAskModal.hidden) closeUnlockAsk();
    else if (!equipAskModal.hidden) closeEquipAsk();
    else if (!siteModal.hidden) closeSiteInfo();
    else if (settingsOpen) closeSettings();
    else if (!endModal.hidden) leaveShaft();
    return;
  }
  if (settingsOpen || !endModal.hidden || !siteModal.hidden || !equipAskModal.hidden || !equipPromptModal.hidden || !unlockAskModal.hidden || !forgeAskModal.hidden || !leaveAskModal.hidden) return;
  if (event.target.closest("button")) return;
  if (screen !== "shaft" || !state) {
    if (screen === "title" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      go("sites");
    }
    return;
  }
  const map = {
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right",
    ArrowDown: "soft",
    s: "soft",
    S: "soft",
    ArrowUp: "cw",
    w: "cw",
    W: "cw",
    x: "cw",
    X: "cw",
    z: "ccw",
    Z: "ccw",
    " ": "hard",
  };
  const action = map[event.key];
  if (!action || event.repeat) return;
  event.preventDefault();
  if (action === "left") pressHorizontal(-1);
  else if (action === "right") pressHorizontal(1);
  else if (action === "soft") {
    held.soft = true;
    softTime = 45;
  } else actOnce(action);
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") releaseHorizontal(-1);
  if (key === "arrowright" || key === "d") releaseHorizontal(1);
  if (key === "arrowdown" || key === "s") held.soft = false;
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(100, now - last);
  last = now;
  if (resetArmed) {
    resetLeft -= dt;
    if (resetLeft <= 0) {
      resetArmed = false;
      document.querySelector("#settings-erase").textContent = "Erase progress";
    }
  }
  if (screen === "shaft" && state) {
    const events = tick(state, dt);
    for (const event of events) handleEvent(event);
    updateHeld(dt);
    syncShaft();
    view.frame(state, dt);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

boot();

window.addEventListener("popstate", () => {
  go(screen, { fromPop: true });
});

window.mine = {
  get progress() {
    return progress;
  },
  get state() {
    return state;
  },
  go,
  begin,
};

function createAudio() {
  let context = null;
  function unlock() {
    if (!context) context = new AudioContext();
    if (context.state === "suspended") context.resume();
  }
  function blip(frequency, seconds) {
    if (!progress.sound) return;
    unlock();
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = frequency;
    osc.type = "square";
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }
  return { unlock, blip };
}
