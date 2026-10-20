function colorDistanceSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return 0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db;
}

function rgbToHex(rgb) {
  return '#' + rgb.map((v) => {
    const n = Math.max(0, Math.min(255, Math.round(v)));
    return n.toString(16).padStart(2, '0');
  }).join('').toUpperCase();
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function sourceCrop(imageWidth, imageHeight, gridWidth, gridHeight, zoom, panX, panY) {
  const z = Math.max(1, Number(zoom) || 1);
  const base = Math.max(gridWidth / imageWidth, gridHeight / imageHeight);
  const scale = base * z;
  const sw = gridWidth / scale;
  const sh = gridHeight / scale;
  const sx = clamp01(panX) * Math.max(0, imageWidth - sw);
  const sy = clamp01(panY) * Math.max(0, imageHeight - sh);
  return { sx, sy, sw, sh };
}

function nearestIndex(pixel, colors) {
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];
    const rgb = color.length ? color : [color.r, color.g, color.b];
    const d = colorDistanceSq(pixel, rgb);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}

function quantizeCenters(pixels, k) {
  const samples = [];
  pixels.forEach((pixel) => {
    if (pixel) samples.push(pixel);
  });
  if (!samples.length) return [];

  const unique = [];
  const seen = new Set();
  samples.forEach((pixel) => {
    const key = pixel[0] + ',' + pixel[1] + ',' + pixel[2];
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(pixel);
    }
  });

  const centerCount = Math.min(k, unique.length);
  const centers = [unique[0].slice()];
  while (centers.length < centerCount) {
    let best = null;
    let bestDist = -1;
    unique.forEach((pixel) => {
      let nearest = Infinity;
      centers.forEach((center) => {
        const d = colorDistanceSq(pixel, center);
        if (d < nearest) nearest = d;
      });
      if (nearest > bestDist) {
        bestDist = nearest;
        best = pixel;
      }
    });
    centers.push(best.slice());
  }

  if (unique.length <= k) return centers;

  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    samples.forEach((pixel) => {
      const index = nearestIndex(pixel, centers);
      sums[index][0] += pixel[0];
      sums[index][1] += pixel[1];
      sums[index][2] += pixel[2];
      sums[index][3] += 1;
    });
    sums.forEach((sum, index) => {
      if (!sum[3]) return;
      centers[index] = [
        Math.round(sum[0] / sum[3]),
        Math.round(sum[1] / sum[3]),
        Math.round(sum[2] / sum[3])
      ];
    });
    for (let index = 0; index < centers.length; index++) {
      if (sums[index][3]) continue;
      let best = null;
      let bestDist = -1;
      samples.forEach((pixel) => {
        let nearest = Infinity;
        centers.forEach((center, centerIndex) => {
          if (centerIndex === index) return;
          const d = colorDistanceSq(pixel, center);
          if (d < nearest) nearest = d;
        });
        if (nearest > bestDist) {
          bestDist = nearest;
          best = pixel;
        }
      });
      if (best) centers[index] = best.slice();
    }
  }
  return centers;
}

function mapCentersToBrand(centers, pixels, brandColors) {
  const weights = centers.map(() => 0);
  pixels.forEach((pixel) => {
    if (!pixel) return;
    weights[nearestIndex(pixel, centers)] += 1;
  });
  const order = centers.map((center, index) => ({ center, index, weight: weights[index] }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const used = new Set();
  const chosen = [];
  order.forEach((item) => {
    let best = -1;
    let dist = Infinity;
    for (let i = 0; i < brandColors.length; i++) {
      if (used.has(i)) continue;
      const brand = brandColors[i];
      const d = colorDistanceSq(item.center, [brand.r, brand.g, brand.b]);
      if (d < dist) {
        dist = d;
        best = i;
      }
    }
    if (best < 0) return;
    used.add(best);
    chosen.push(brandColors[best]);
  });
  return chosen;
}

function addError(buffer, width, height, x, y, er, eg, eb, factor) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const pixel = buffer[y * width + x];
  if (!pixel) return;
  pixel[0] += er * factor;
  pixel[1] += eg * factor;
  pixel[2] += eb * factor;
}

function assignColors(pixels, width, height, palette, dither) {
  const buffer = pixels.map((pixel) => (pixel ? pixel.slice() : null));
  const cells = new Array(pixels.length);
  for (let y = 0; y < height; y++) {
    const reverse = dither && (y % 2 === 1);
    const xStart = reverse ? width - 1 : 0;
    const xEnd = reverse ? -1 : width;
    const step = reverse ? -1 : 1;
    for (let x = xStart; x !== xEnd; x += step) {
      const index = y * width + x;
      const pixel = buffer[index];
      if (!pixel) {
        cells[index] = -1;
        continue;
      }
      const chosen = nearestIndex(pixel, palette);
      cells[index] = chosen;
      if (!dither) continue;
      const brand = palette[chosen];
      const er = pixel[0] - brand.r;
      const eg = pixel[1] - brand.g;
      const eb = pixel[2] - brand.b;
      const dir = step;
      addError(buffer, width, height, x + dir, y, er, eg, eb, 7 / 16);
      addError(buffer, width, height, x - dir, y + 1, er, eg, eb, 3 / 16);
      addError(buffer, width, height, x, y + 1, er, eg, eb, 5 / 16);
      addError(buffer, width, height, x + dir, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return cells;
}

function coverFrame(stageWidth, gridWidth, gridHeight) {
  let frameW = stageWidth;
  let frameH = frameW * gridHeight / gridWidth;
  const maxH = Math.min(stageWidth * 1.25, 420);
  if (frameH > maxH) {
    frameH = maxH;
    frameW = frameH * gridWidth / gridHeight;
  }
  return { frameW, frameH };
}

function coverPlacement(imageWidth, imageHeight, frameW, frameH, zoom, panX, panY) {
  const z = Math.max(1, Number(zoom) || 1);
  const px = Math.max(0, Math.min(1, Number.isFinite(Number(panX)) ? Number(panX) : 0.5));
  const py = Math.max(0, Math.min(1, Number.isFinite(Number(panY)) ? Number(panY) : 0.5));
  const base = Math.max(frameW / imageWidth, frameH / imageHeight);
  const scale = base * z;
  const imgW = Math.ceil(imageWidth * scale);
  const imgH = Math.ceil(imageHeight * scale);
  return {
    imgW,
    imgH,
    left: -px * Math.max(0, imgW - frameW),
    top: -py * Math.max(0, imgH - frameH)
  };
}

function buildBeadPattern({ pixels, width, height, colorLimit, dither, brandColors }) {
  if (pixels.length !== width * height) throw new Error('SIZE');
  const opaque = pixels.some((pixel) => pixel);
  if (!opaque) {
    const error = new Error('EMPTY_IMAGE');
    throw error;
  }
  const centers = quantizeCenters(pixels, colorLimit);
  let palette = mapCentersToBrand(centers, pixels, brandColors);
  if (!palette.length) {
    throw new Error('EMPTY_IMAGE');
  }

  const rough = assignColors(pixels, width, height, palette, false);
  const used = new Set(rough.filter((index) => index >= 0));
  palette = palette.filter((_, index) => used.has(index));
  const cells = assignColors(pixels, width, height, palette, dither);

  const counts = palette.map(() => 0);
  let emptyCount = 0;
  cells.forEach((index) => {
    if (index < 0) emptyCount += 1;
    else counts[index] += 1;
  });

  const order = palette.map((_, index) => index)
    .filter((index) => counts[index] > 0)
    .sort((a, b) => counts[b] - counts[a] || palette[a].code.localeCompare(palette[b].code));
  const remap = new Map(order.map((oldIndex, rank) => [oldIndex, rank]));
  const sorted = order.map((oldIndex, rank) => {
    const brand = palette[oldIndex];
    return {
      code: brand.code,
      r: brand.r,
      g: brand.g,
      b: brand.b,
      hex: brand.hex || rgbToHex([brand.r, brand.g, brand.b]),
      count: counts[oldIndex],
      index: rank + 1
    };
  });
  const numbered = cells.map((index) => (index < 0 ? 0 : remap.get(index) + 1));
  const totalBeads = counts.reduce((sum, count) => sum + count, 0);
  return {
    cells: numbered,
    palette: sorted,
    totalBeads,
    emptyCount
  };
}

function cellSizeForGrid(width, height) {
  const longest = Math.max(width, height);
  const fitted = Math.floor(1800 / longest);
  return Math.max(18, Math.min(28, fitted));
}

function patternCanvasSize(gridWidth, gridHeight, paletteLength) {
  const cell = cellSizeForGrid(gridWidth, gridHeight);
  const patternW = gridWidth * cell;
  const patternH = gridHeight * cell;
  const canvasW = Math.max(patternW, 420);
  const cols = Math.max(1, Math.floor(canvasW / 210));
  const rows = Math.max(1, Math.ceil(paletteLength / cols));
  const headerH = 44;
  const legendTitleH = 28;
  const rowH = 36;
  const legendH = legendTitleH + rows * rowH + 16;
  return {
    cell,
    patternW,
    patternH,
    canvasW,
    canvasH: headerH + patternH + legendH,
    headerH,
    legendH,
    legendTitleH,
    rowH,
    cols
  };
}

module.exports = {
  buildBeadPattern,
  sourceCrop,
  coverFrame,
  coverPlacement,
  cellSizeForGrid,
  patternCanvasSize,
  colorDistanceSq,
  rgbToHex
};
