import { axeById, COLS, ORE_BY_ID, ROWS } from "./data.js";
import { orientedCells } from "./engine.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function fit(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function strongBlock(ticket, oreId) {
  const axe = axeById(ticket);
  return Boolean(axe) && !axe.wildcards.includes(oreId);
}

function mixColor(from, to, t) {
  const parse = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const a = parse(from);
  const b = parse(to);
  const channel = a.map((value, i) => Math.round(value + (b[i] - value) * t));
  return `rgb(${channel[0]}, ${channel[1]}, ${channel[2]})`;
}

function fillTri(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.closePath();
  ctx.fill();
}

function pyramidFaces(left, top, width, height) {
  const right = left + width;
  const bottom = top + height;
  const cx = left + width / 2;
  const cy = top + height / 2;
  return {
    top: [[left, top], [right, top], [cx, cy]],
    left: [[left, top], [left, bottom], [cx, cy]],
    right: [[right, top], [right, bottom], [cx, cy]],
    bottom: [[left, bottom], [right, bottom], [cx, cy]],
  };
}

function drawPyramid(ctx, left, top, width, height, ore) {
  const faces = pyramidFaces(left, top, width, height);
  const side = mixColor(ore.fill, ore.deep, 0.5);
  fillTri(ctx, faces.top, ore.fill);
  fillTri(ctx, faces.left, side);
  fillTri(ctx, faces.right, side);
  fillTri(ctx, faces.bottom, ore.deep);
}

function drawBlock(ctx, x, y, size, oreId, options = {}) {
  const ore = ORE_BY_ID[oreId];
  if (!ore) return;
  const gap = Math.max(1, size * 0.06);
  const left = x + gap;
  const top = y + gap;
  const width = size - gap * 2;
  const height = size - gap * 2;
  if (options.ghost) {
    ctx.save();
    ctx.strokeStyle = ore.fill;
    ctx.fillStyle = ore.fill;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, size * 0.06);
    if (options.strong) {
      const faces = pyramidFaces(left, top, width, height);
      fillTri(ctx, faces.top, ore.fill);
      fillTri(ctx, faces.bottom, ore.fill);
    }
    ctx.strokeRect(left, top, width, height);
    ctx.restore();
    return;
  }
  if (options.strong) {
    drawPyramid(ctx, left, top, width, height, ore);
    if (options.wash) {
      ctx.fillStyle = "rgba(243, 234, 215, 0.55)";
      ctx.fillRect(left, top, width, height);
    }
    return;
  }
  ctx.fillStyle = ore.fill;
  ctx.fillRect(left, top, width, height);
  if (options.wash) {
    ctx.fillStyle = "rgba(243, 234, 215, 0.55)";
    ctx.fillRect(left, top, width, height);
  }
}

function drawBurst(ctx, x, y, size, oreId, t, strong) {
  const flash = t < 0.22 ? 1 - t / 0.22 : 0;
  const scale = 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.42;
  const alpha = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + size / 2, y + size / 2);
  ctx.scale(scale, scale);
  drawBlock(ctx, -size / 2, -size / 2, size, oreId, { wash: flash > 0.35, strong });
  if (flash > 0) {
    ctx.globalAlpha = alpha * flash * 0.9;
    ctx.fillStyle = "#fff6e4";
    ctx.fillRect(-size * 0.42, -size * 0.42, size * 0.84, size * 0.84);
  }
  if (strong) {
    const ore = ORE_BY_ID[oreId];
    const gap = Math.max(1, size * 0.06);
    ctx.globalAlpha = alpha;
    drawPyramid(ctx, -size / 2 + gap, -size / 2 + gap, size - gap * 2, size - gap * 2, ore);
  }
  ctx.restore();
}

function drawPreview(ctx, piece, width, height, ticket) {
  ctx.clearRect(0, 0, width, height);
  if (width < 8 || height < 8) return;
  const size = Math.min(width, height) / 4;
  const originX = (width - size * 4) / 2;
  const originY = (height - size * 4) / 2;
  ctx.fillStyle = "#0c0b09";
  ctx.fillRect(originX, originY, size * 4, size * 4);
  ctx.strokeStyle = "#241f1a";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(originX + i * size, originY);
    ctx.lineTo(originX + i * size, originY + size * 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(originX, originY + i * size);
    ctx.lineTo(originX + size * 4, originY + i * size);
    ctx.stroke();
  }
  ctx.strokeRect(originX + 0.5, originY + 0.5, size * 4 - 1, size * 4 - 1);
  if (!piece) return;
  const cells = orientedCells(piece.type, piece.ores, 0);
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const spanX = Math.max(...cells.map((cell) => cell.x)) - minX + 1;
  const spanY = Math.max(...cells.map((cell) => cell.y)) - minY + 1;
  const shiftX = Math.floor((4 - spanX) / 2) - minX;
  const shiftY = Math.floor((4 - spanY) / 2) - minY;
  for (const cell of cells) {
    drawBlock(ctx, originX + (cell.x + shiftX) * size, originY + (cell.y + shiftY) * size, size, cell.ore, {
      strong: strongBlock(ticket, cell.ore),
    });
  }
}

function stuckRow() {
  return false;
}

export function createView(shaft, next) {
  const particles = [];
  const floats = [];
  let shake = 0;

  function onEvent(event) {
    if (event.type === "burst") {
      if (REDUCED) return;
      shake = Math.min(5, 2.4 + event.chain * 0.6);
      for (const cell of event.cells) {
        const ore = ORE_BY_ID[cell.ore];
        const shards = 9;
        for (let i = 0; i < shards; i += 1) {
          const angle = (Math.PI * 2 * i) / shards + (Math.random() - 0.5) * 0.45;
          const speed = 0.65 + Math.random() * 0.7;
          particles.push({
            x: (cell.x + 0.5) / COLS,
            y: (cell.y + 0.5) / ROWS,
            vx: Math.cos(angle) * speed * 0.34,
            vy: Math.sin(angle) * speed * 0.2 - 0.05,
            life: 620,
            max: 620,
            size: 0.42 + Math.random() * 0.55,
            color: i % 3 === 0 ? "#fff6e4" : i % 2 === 0 ? ore.fill : ore.deep,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 10,
          });
        }
      }
      return;
    }
    if (event.type !== "mine") return;
    if (event.groups.length === 0) return;
    const label = event.groups
      .map((group) => `+${group.amount} ${ORE_BY_ID[group.ore].name}`)
      .join("  ");
    floats.push({ label, life: 700, y: event.rows[0] ?? 10 });
    if (!REDUCED) shake = Math.max(shake, event.lines >= 3 ? 4 : 1.6);
  }

  function layoutShaft() {
    const wrap = shaft.parentElement;
    const well = wrap?.parentElement;
    if (!wrap || !well) return;
    const bench = well.parentElement;
    const screen = bench?.parentElement;
    const side = bench?.querySelector(".side");
    if (!bench || !screen) return;
    const portrait = window.matchMedia("(max-width: 760px) and (orientation: portrait)").matches;
    const phoneLandscape = window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
    if (phoneLandscape) {
      if (side) {
        side.style.marginTop = "";
        side.style.height = "";
        side.style.alignSelf = "";
      }
      screen.style.removeProperty("--pack-top");
      screen.style.removeProperty("--next-size");
      const screenStyle = getComputedStyle(screen);
      const padX = Number.parseFloat(screenStyle.paddingLeft) + Number.parseFloat(screenStyle.paddingRight);
      const padY = Number.parseFloat(screenStyle.paddingTop) + Number.parseFloat(screenStyle.paddingBottom);
      const gap = Number.parseFloat(getComputedStyle(bench).columnGap) || 0;
      const availableHeight = screen.clientHeight - padY;
      const availableWidth = screen.clientWidth - padX - gap * 2;
      if (availableHeight < 80 || availableWidth < 80) return;
      let height = availableHeight;
      let width = height * (COLS / ROWS);
      if (width > availableWidth) {
        width = availableWidth;
        height = width * (ROWS / COLS);
      }
      width = Math.floor(width);
      height = Math.floor(height);
      wrap.style.width = `${width}px`;
      wrap.style.height = `${height}px`;
      const sideRoom = Math.max(0, (availableWidth - width) / 2);
      const stick = Math.min(160, Math.floor(sideRoom));
      screen.style.setProperty("--stick-size", `${Math.max(96, stick)}px`);
      return;
    }
    screen.style.removeProperty("--stick-size");
    if (portrait) {
      if (side) {
        side.style.marginTop = "";
        side.style.height = "";
        side.style.alignSelf = "";
      }
      const screenStyle = getComputedStyle(screen);
      const padX = Number.parseFloat(screenStyle.paddingLeft) + Number.parseFloat(screenStyle.paddingRight);
      const padY = Number.parseFloat(screenStyle.paddingTop) + Number.parseFloat(screenStyle.paddingBottom);
      const rowGap = Number.parseFloat(screenStyle.rowGap) || 0;
      const touch = screen.querySelector(".touch");
      const ctrlMin = touch ? Number.parseFloat(getComputedStyle(touch).minHeight) || 0 : 0;
      const title = screen.querySelector(".shaft-bar");
      const titleH = title && getComputedStyle(title).display !== "contents" ? title.offsetHeight : (screen.querySelector("#shaft-site")?.offsetHeight || 0);
      const availableHeight = screen.clientHeight - padY - titleH - rowGap * 2 - ctrlMin;
      const colGap = Number.parseFloat(screenStyle.columnGap) || 0;
      const minNext = Number.parseFloat(screenStyle.getPropertyValue("--next-min")) || 64;
      const maxNext = Number.parseFloat(screenStyle.getPropertyValue("--next-max")) || 90;
      const space = screen.clientWidth - padX - colGap * 3;
      const idealBoard = availableHeight * (COLS / ROWS);
      let nextWidth = space - idealBoard;
      if (nextWidth > maxNext) nextWidth = maxNext;
      if (nextWidth < minNext) nextWidth = minNext;
      screen.style.setProperty("--next-size", `${Math.round(nextWidth)}px`);
      const availableWidth = space - nextWidth;
      if (availableHeight < 80 || availableWidth < 80) return;
      let height = availableHeight;
      let width = height * (COLS / ROWS);
      if (width > availableWidth) {
        width = availableWidth;
        height = width * (ROWS / COLS);
      }
      wrap.style.width = `${Math.floor(width)}px`;
      wrap.style.height = `${Math.floor(height)}px`;
      const pack = screen.querySelector("#shaft-pack");
      if (pack) {
        const top = Math.max(0, Math.floor(height) - pack.offsetHeight);
        screen.style.setProperty("--pack-top", `${top}px`);
      }
      return;
    }
    screen.style.removeProperty("--pack-top");
    screen.style.removeProperty("--next-size");
    const extras = [...well.children].filter((node) => node !== wrap);
    const extraHeight = extras.reduce((sum, node) => sum + node.offsetHeight, 0) + 16;
    const availableHeight = bench.clientHeight - extraHeight;
    const screenStyle = getComputedStyle(screen);
    const padX = Number.parseFloat(screenStyle.paddingLeft) + Number.parseFloat(screenStyle.paddingRight);
    const gap = Number.parseFloat(getComputedStyle(bench).columnGap) || 0;
    const sideWidth = side ? side.offsetWidth : 0;
    const availableWidth = screen.clientWidth - padX - sideWidth - gap;
    if (availableHeight < 80 || availableWidth < 80) return;
    let height = availableHeight;
    let width = height * (COLS / ROWS);
    if (width > availableWidth) {
      width = availableWidth;
      height = width * (ROWS / COLS);
    }
    wrap.style.width = `${Math.floor(width)}px`;
    wrap.style.height = `${Math.floor(height)}px`;
    if (!side) return;
    const benchTop = bench.getBoundingClientRect().top;
    const wrapTop = wrap.getBoundingClientRect().top;
    side.style.alignSelf = "flex-start";
    side.style.marginTop = `${Math.round(wrapTop - benchTop)}px`;
    side.style.height = `${Math.floor(height)}px`;
  }

  function frame(state, dt) {
    layoutShaft();
    const board = fit(shaft);
    const upcoming = fit(next);
    if (board.width < 8 || board.height < 8) return;

    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * (dt / 1000);
      particle.y += particle.vy * (dt / 1000);
      particle.vy += dt / 1800;
      particle.rot = (particle.rot ?? 0) + (particle.vr ?? 0) * (dt / 1000);
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
    for (const item of floats) item.life -= dt;
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      if (floats[i].life <= 0) floats.splice(i, 1);
    }
    if (shake > 0.15) shake *= 0.86;
    else shake = 0;

    const { ctx } = board;
    const cell = board.width / COLS;
    ctx.clearRect(0, 0, board.width, board.height);
    ctx.save();
    if (!REDUCED && shake > 0 && state.status === "playing") {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    ctx.fillStyle = "#0c0b09";
    ctx.fillRect(0, 0, board.width, board.height);
    ctx.strokeStyle = "#241f1a";
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, board.height);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell);
      ctx.lineTo(board.width, y * cell);
      ctx.stroke();
    }

    const clearing = new Set(state.clearCells ?? []);
    const gone = new Set(state.clearGone ?? []);
    const burstT = state.clearPhase === "burst" && state.clearDuration > 0
      ? 1 - state.clearLeft / state.clearDuration
      : 0;
    const slide = new Map();
    if (!REDUCED && state.clearPhase === "fall" && state.clearDuration > 0) {
      const t = 1 - state.clearLeft / state.clearDuration;
      const eased = 1 - (1 - t) ** 2;
      for (const move of state.falls ?? []) {
        slide.set(`${move.x},${move.to}`, move.from + (move.to - move.from) * eased);
      }
    }
    state.board.forEach((row, y) => {
      row.forEach((ore, x) => {
        if (!ore) return;
        const key = `${x},${y}`;
        if (gone.has(key)) return;
        if (clearing.has(key)) drawBurst(ctx, x * cell, y * cell, cell, ore, burstT, strongBlock(state.ticket, ore));
        else drawBlock(ctx, x * cell, (slide.get(key) ?? y) * cell, cell, ore, { strong: strongBlock(state.ticket, ore) });
      });
      if (stuckRow(state, row)) {
        ctx.save();
        ctx.strokeStyle = "#f3ead7";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cell * 0.15, (y + 1) * cell - 2);
        ctx.lineTo(board.width - cell * 0.15, (y + 1) * cell - 2);
        ctx.stroke();
        ctx.restore();
      }
    });

    if (state.piece && state.status === "playing") {
      const ghost = ghostCells(state);
      const live = new Set(worldKey(state));
      for (const cellPos of ghost) {
        const key = `${cellPos.x},${cellPos.y}`;
        if (!live.has(key)) {
          drawBlock(ctx, cellPos.x * cell, cellPos.y * cell, cell, cellPos.ore, {
            ghost: true,
            strong: strongBlock(state.ticket, cellPos.ore),
          });
        }
      }
      for (const cellPos of cellsNow(state)) {
        drawBlock(ctx, cellPos.x * cell, cellPos.y * cell, cell, cellPos.ore, {
          strong: strongBlock(state.ticket, cellPos.ore),
        });
      }
    }

    for (const particle of particles) {
      const life = particle.max ? particle.life / particle.max : particle.life / 420;
      ctx.save();
      ctx.globalAlpha = Math.max(0, life);
      ctx.fillStyle = particle.color;
      const px = particle.x * board.width;
      const py = particle.y * board.height;
      const shard = (particle.size ?? 0.45) * cell;
      ctx.translate(px, py);
      ctx.rotate(particle.rot ?? 0);
      ctx.fillRect(-shard / 2, -shard / 2, shard, shard * 0.62);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f3ead7";
    ctx.font = "600 16px Sora, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const item of floats) {
      ctx.globalAlpha = Math.max(0, item.life / 700);
      const rise = REDUCED ? 0 : (1 - item.life / 700) * cell;
      ctx.fillText(item.label, board.width / 2, item.y * cell - rise);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    drawPreview(upcoming.ctx, state.queue[0], upcoming.width, upcoming.height, state.ticket);
  }

  return { frame, onEvent };
}

function cellsNow(state) {
  return orientedCells(state.piece.type, state.piece.ores, state.piece.r).map((cell) => ({
    x: cell.x + state.piece.x,
    y: cell.y + state.piece.y,
    ore: cell.ore,
  }));
}

function worldKey(state) {
  return cellsNow(state).map((cell) => `${cell.x},${cell.y}`);
}

function ghostCells(state) {
  let y = state.piece.y;
  const probe = { ...state.piece };
  while (true) {
    probe.y = y + 1;
    const cells = orientedCells(probe.type, probe.ores, probe.r).map((cell) => ({
      x: cell.x + probe.x,
      y: cell.y + probe.y,
      ore: cell.ore,
    }));
    const blocked = cells.some((cell) => {
      if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return true;
      if (cell.y < 0) return false;
      return Boolean(state.board[cell.y][cell.x]);
    });
    if (blocked) break;
    y += 1;
  }
  probe.y = y;
  if (y === state.piece.y) return [];
  return orientedCells(probe.type, probe.ores, probe.r).map((cell) => ({
    x: cell.x + probe.x,
    y: cell.y + probe.y,
    ore: cell.ore,
  }));
}
