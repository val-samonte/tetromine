import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SHAFT = [0x0c, 0x0b, 0x09, 255];
const GRID = [0x24, 0x1f, 0x1a, 255];
const FRAME = [0x3a, 0x32, 0x28, 255];
const ORES = {
  tin: { fill: [0x3f, 0xaf, 0xa4], deep: [0x14, 0x62, 0x5c] },
  copper: { fill: [0xe0, 0x70, 0x3a], deep: [0x8a, 0x3c, 0x16] },
  coal: { fill: [0x3a, 0x3f, 0x66], deep: [0x1a, 0x1d, 0x33] },
};

// A 7: the top-left cell stays empty and the stem lands on [2,2].
const CELLS = [
  [1, 0, "tin"],
  [2, 0, "copper"],
  [2, 1, "coal"],
  [2, 2, "tin"],
];

function mix(from, to, t) {
  return from.map((value, i) => Math.round(value + (to[i] - value) * t));
}

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paint(size, padRatio) {
  const scale = 4;
  const px = size * scale;
  const data = Buffer.alloc(px * px * 4, 0);
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= px || y >= px) return;
    const i = (y * px + x) * 4;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3] ?? 255;
  };
  const fillRect = (x, y, w, h, color) => {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = Math.round(x + w);
    const y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) set(xx, yy, color);
    }
  };

  fillRect(0, 0, px, px, SHAFT);
  const pad = px * padRatio;
  const board = px - pad * 2;
  const cell = board / 3;
  const line = Math.max(scale, Math.round(px / 192));
  fillRect(pad, pad, board, line, FRAME);
  fillRect(pad, pad + board - line, board, line, FRAME);
  fillRect(pad, pad, line, board, FRAME);
  fillRect(pad + board - line, pad, line, board, FRAME);
  for (let i = 1; i < 3; i += 1) {
    fillRect(pad + i * cell - line / 2, pad, line, board, GRID);
    fillRect(pad, pad + i * cell - line / 2, board, line, GRID);
  }

  for (const [col, row, id] of CELLS) {
    const ore = ORES[id];
    const gap = cell * 0.06;
    const left = pad + col * cell + gap;
    const top = pad + row * cell + gap;
    const block = cell - gap * 2;
    const side = mix(ore.fill, ore.deep, 0.5);
    const x0 = Math.floor(left);
    const y0 = Math.floor(top);
    const x1 = Math.ceil(left + block);
    const y1 = Math.ceil(top + block);
    const cx = left + block / 2;
    const cy = top + block / 2;
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) {
        if (xx + 0.5 < left || yy + 0.5 < top || xx + 0.5 >= left + block || yy + 0.5 >= top + block) continue;
        const dx = (xx + 0.5 - cx) / block;
        const dy = (yy + 0.5 - cy) / block;
        const face = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? ore.fill : ore.deep) : side;
        set(xx, yy, [...face, 255]);
      }
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const sample = scale * scale;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          const i = ((y * scale + yy) * px + (x * scale + xx)) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          a += data[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / sample);
      out[o + 1] = Math.round(g / sample);
      out[o + 2] = Math.round(b / sample);
      out[o + 3] = Math.round(a / sample);
    }
  }
  return out;
}

function writeIcon(name, size, padRatio) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), encodePng(size, size, paint(size, padRatio)));
}

function svgIcon() {
  const size = 300;
  const pad = 30;
  const cell = 80;
  const line = 2;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" fill="#0c0b09"/>`,
  ];
  const rect = (x, y, w, h, fill) => parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
  rect(pad, pad, cell * 3, line, "#3a3228");
  rect(pad, pad + cell * 3 - line, cell * 3, line, "#3a3228");
  rect(pad, pad, line, cell * 3, "#3a3228");
  rect(pad + cell * 3 - line, pad, line, cell * 3, "#3a3228");
  for (let i = 1; i < 3; i += 1) {
    rect(pad + i * cell - line / 2, pad, line, cell * 3, "#241f1a");
    rect(pad, pad + i * cell - line / 2, cell * 3, line, "#241f1a");
  }
  const hex = (channels) => `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  const poly = (points, fill) => {
    const coords = points.map(([x, y]) => `${x},${y}`).join(" ");
    parts.push(`<polygon points="${coords}" fill="${fill}"/>`);
  };
  for (const [col, row, id] of CELLS) {
    const ore = ORES[id];
    const gap = cell * 0.06;
    const left = pad + col * cell + gap;
    const top = pad + row * cell + gap;
    const block = cell - gap * 2;
    const right = left + block;
    const bottom = top + block;
    const cx = left + block / 2;
    const cy = top + block / 2;
    const side = hex(mix(ore.fill, ore.deep, 0.5));
    poly([[left, top], [right, top], [cx, cy]], hex(ore.fill));
    poly([[left, top], [left, bottom], [cx, cy]], side);
    poly([[right, top], [right, bottom], [cx, cy]], side);
    poly([[left, bottom], [right, bottom], [cx, cy]], hex(ore.deep));
  }
  parts.push("</svg>");
  writeFileSync(new URL("../public/favicon.svg", import.meta.url), `${parts.join("\n")}\n`);
}

svgIcon();
writeIcon("favicon-32.png", 32, 0.1);
writeIcon("apple-touch-icon.png", 180, 0.1);
writeIcon("icon-192.png", 192, 0.1);
writeIcon("icon-512.png", 512, 0.1);
writeIcon("icon-maskable-512.png", 512, 0.22);
