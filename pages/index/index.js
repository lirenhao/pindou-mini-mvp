const { MARD_COLORS, MARD_PALETTE_NAME } = require('../../utils/mard-palette.js');
const { buildBeadPattern, sourceCrop, coverFrame, coverPlacement, patternCanvasSize, fitPreview, clampPreviewPan } = require('../../utils/pattern.js');

const MAX_DIMENSION = 100;

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function ink(r, g, b) {
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#2A241F' : '#FFFFFF';
}

function drawPattern(ctx, spec, gridWidth, gridHeight, result, withLegend) {
  const canvasW = spec.canvasW;
  const canvasH = spec.canvasH;
  const patternW = spec.patternW;
  const patternH = spec.patternH;
  const headerH = spec.headerH;
  const cell = spec.cell;
  const originX = Math.round((canvasW - patternW) / 2);

  ctx.fillStyle = '#FFFAF5';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(originX, headerH, patternW, patternH);

  ctx.fillStyle = '#2E2925';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    gridWidth + '×' + gridHeight + '  ·  ' + result.totalBeads + ' 颗  ·  ' + MARD_PALETTE_NAME,
    12,
    headerH / 2
  );

  result.cells.forEach((colorIndex, idx) => {
    const x = idx % gridWidth;
    const y = Math.floor(idx / gridWidth);
    const px = originX + x * cell;
    const py = headerH + y * cell;
    if (!colorIndex) {
      ctx.fillStyle = '#E7E0D8';
      ctx.fillRect(px, py, cell, cell);
      return;
    }
    ctx.fillStyle = result.palette[colorIndex - 1].hex;
    ctx.fillRect(px, py, cell, cell);
  });

  ctx.strokeStyle = 'rgba(45, 39, 35, 0.35)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let x = 0; x <= gridWidth; x++) {
    const lineX = originX + x * cell + 0.3;
    ctx.moveTo(lineX, headerH);
    ctx.lineTo(lineX, headerH + patternH);
  }
  for (let y = 0; y <= gridHeight; y++) {
    const lineY = headerH + y * cell + 0.3;
    ctx.moveTo(originX, lineY);
    ctx.lineTo(originX + patternW, lineY);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(45, 39, 35, 0.8)';
  ctx.lineWidth = 1.6;
  for (let x = 0; x <= gridWidth; x += 10) {
    const lineX = originX + x * cell + 0.3;
    ctx.moveTo(lineX, headerH);
    ctx.lineTo(lineX, headerH + patternH);
  }
  if (gridWidth % 10 !== 0) {
    ctx.moveTo(originX + patternW - 0.3, headerH);
    ctx.lineTo(originX + patternW - 0.3, headerH + patternH);
  }
  for (let y = 0; y <= gridHeight; y += 10) {
    const lineY = headerH + y * cell + 0.3;
    ctx.moveTo(originX, lineY);
    ctx.lineTo(originX + patternW, lineY);
  }
  if (gridHeight % 10 !== 0) {
    ctx.moveTo(originX, headerH + patternH - 0.3);
    ctx.lineTo(originX + patternW, headerH + patternH - 0.3);
  }
  ctx.stroke();

  const fontSize = cell >= 24 ? 12 : (cell >= 18 ? 10 : 8);
  ctx.font = 'bold ' + fontSize + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  result.cells.forEach((colorIndex, idx) => {
    if (!colorIndex) return;
    const color = result.palette[colorIndex - 1];
    const x = idx % gridWidth;
    const y = Math.floor(idx / gridWidth);
    const cx = originX + x * cell + cell / 2;
    const cy = headerH + y * cell + cell / 2;
    const textColor = ink(color.r, color.g, color.b);
    ctx.fillStyle = textColor;
    if (cell >= 22) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = textColor === '#FFFFFF' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)';
      ctx.strokeText(String(colorIndex), cx, cy);
    }
    ctx.fillText(String(colorIndex), cx, cy);
  });

  if (withLegend === false) return;

  const legendTop = headerH + patternH;
  ctx.fillStyle = '#8B8179';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('数字对应 MARD 色号，留空不计入。请以实物色卡核对。', 12, legendTop + 14);

  const itemW = canvasW / spec.cols;
  result.palette.forEach((color, i) => {
    const col = i % spec.cols;
    const row = Math.floor(i / spec.cols);
    const x = col * itemW + 12;
    const y = legendTop + spec.legendTitleH + row * spec.rowH;
    ctx.fillStyle = color.hex;
    ctx.fillRect(x, y, 22, 22);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 22, 22);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2E2925';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(color.index + '  ' + color.code, x + 30, y + 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8B8179';
    ctx.font = '12px sans-serif';
    ctx.fillText(color.count + ' 颗', x + itemW - 20, y + 11);
  });
}

Page({
  data: {
    imagePath: '',
    imageWidth: 0,
    imageHeight: 0,
    stageWidth: 0,
    panX: 0.5,
    panY: 0.5,
    zoom: 1,
    zoomText: '1.0',
    cropFrameW: 0,
    cropFrameH: 0,
    cropImgW: 0,
    cropImgH: 0,
    cropLeft: 0,
    cropTop: 0,
    gridWidth: '29',
    gridHeight: '29',
    colorLimit: '12',
    dither: true,
    generating: false,
    exporting: false,
    patternReady: false,
    patternStale: false,
    patternPath: '',
    previewPath: '',
    patternPixelW: 0,
    patternPixelH: 0,
    previewAreaH: 420,
    previewBaseW: 1,
    previewBaseH: 1,
    previewTx: 0,
    previewTy: 0,
    previewScale: 1,
    previewScaleText: '100%',
    palette: [],
    totalBeads: 0,
    emptyCount: 0,
    showPrivacy: false,
    useCanvas: false,
    canvasCssW: 300,
    canvasCssH: 300
  },

  onWidthInput(e) {
    const value = e.detail.value;
    this.updateParam({ gridWidth: value }, () => {
      const n = parseInt(value, 10);
      if (n >= 5 && n <= MAX_DIMENSION) this.layoutCrop();
    });
  },

  onHeightInput(e) {
    const value = e.detail.value;
    this.updateParam({ gridHeight: value }, () => {
      const n = parseInt(value, 10);
      if (n >= 5 && n <= MAX_DIMENSION) this.layoutCrop();
    });
  },

  onColorInput(e) {
    this.updateParam({ colorLimit: e.detail.value });
  },

  onDitherChange(e) {
    this.updateParam({ dither: !!e.detail.value });
  },

  onZoomChanging(e) {
    const zoom = Math.max(1, Math.min(3, Number(e.detail.value) || 1));
    this.updateParam({ zoom, zoomText: zoom.toFixed(1) }, () => this.layoutCrop());
  },

  updateParam(patch, done) {
    if (this.data.patternReady) patch.patternStale = true;
    this.setData(patch, done);
  },

  resetCrop() {
    this.updateParam({ panX: 0.5, panY: 0.5, zoom: 1, zoomText: '1.0' }, () => this.layoutCrop());
  },

  chooseImage() {
    this.pickImage();
  },

  pickImage() {
    const page = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        wx.getImageInfo({
          src: file.tempFilePath,
          success(info) {
            page.setData({
              imagePath: file.tempFilePath,
              imageWidth: info.width,
              imageHeight: info.height,
              panX: 0.5,
              panY: 0.5,
              zoom: 1,
              zoomText: '1.0',
              patternReady: false,
              patternStale: false,
              patternPath: '',
              previewPath: '',
              palette: [],
              totalBeads: 0,
              emptyCount: 0
            }, () => page.measureCrop());
          },
          fail() {
            wx.showToast({ title: '未能读取图片', icon: 'none' });
          }
        });
      },
      fail(err) {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('cancel') >= 0) return;
        if ((err && err.errno === 112) || msg.indexOf('not declared') >= 0) {
          page.showPrivacyScopeError('choose');
          return;
        }
        if (msg.indexOf('privacy') >= 0) {
          wx.showToast({ title: '需先同意隐私保护指引', icon: 'none' });
          return;
        }
        wx.showToast({ title: '未能选择图片', icon: 'none' });
      }
    });
  },

  measureCrop() {
    const page = this;
    wx.nextTick(() => {
      wx.createSelectorQuery().in(page).select('.crop-stage').boundingClientRect((rect) => {
        if (!rect || !rect.width) return;
        page.setData({ stageWidth: rect.width }, () => page.layoutCrop());
      }).exec();
    });
  },

  layoutCrop() {
    const imageWidth = this.data.imageWidth;
    const imageHeight = this.data.imageHeight;
    const stageWidth = this.data.stageWidth;
    if (!imageWidth || !imageHeight || !stageWidth) return;
    const gridWidth = clampInt(this.data.gridWidth, 29, 5, MAX_DIMENSION);
    const gridHeight = clampInt(this.data.gridHeight, 29, 5, MAX_DIMENSION);
    const frame = coverFrame(stageWidth, gridWidth, gridHeight);
    const placed = coverPlacement(
      imageWidth,
      imageHeight,
      frame.frameW,
      frame.frameH,
      this.data.zoom,
      this.data.panX,
      this.data.panY
    );
    this.setData({
      cropFrameW: frame.frameW,
      cropFrameH: frame.frameH,
      cropImgW: placed.imgW,
      cropImgH: placed.imgH,
      cropLeft: placed.left,
      cropTop: placed.top
    });
  },

  onCropStart(e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this._drag = {
      x: touch.clientX,
      y: touch.clientY,
      panX: this.data.panX,
      panY: this.data.panY
    };
  },

  onCropMove(e) {
    if (!this._drag) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const roomX = this.data.cropImgW - this.data.cropFrameW;
    const roomY = this.data.cropImgH - this.data.cropFrameH;
    let panX = this._drag.panX;
    let panY = this._drag.panY;
    if (roomX > 1) panX -= (touch.clientX - this._drag.x) / roomX;
    if (roomY > 1) panY -= (touch.clientY - this._drag.y) / roomY;
    panX = Math.max(0, Math.min(1, panX));
    panY = Math.max(0, Math.min(1, panY));
    const patch = {
      panX,
      panY,
      cropLeft: -panX * Math.max(0, roomX),
      cropTop: -panY * Math.max(0, roomY)
    };
    if (this.data.patternReady) patch.patternStale = true;
    this.setData(patch);
  },

  onCropEnd() {
    this._drag = null;
  },

  async generatePattern() {
    if (!this.data.imagePath || !this.data.imageWidth || !this.data.imageHeight) {
      wx.showToast({ title: '请先选择一张图片', icon: 'none' });
      return;
    }
    const width = clampInt(this.data.gridWidth, 29, 5, MAX_DIMENSION);
    const height = clampInt(this.data.gridHeight, 29, 5, MAX_DIMENSION);
    const colorLimit = clampInt(this.data.colorLimit, 12, 2, 32);
    this.setData({
      gridWidth: String(width),
      gridHeight: String(height),
      colorLimit: String(colorLimit),
      generating: true
    });
    if (this.data.stageWidth) this.layoutCrop();

    try {
      const result = await this.processImage(width, height, colorLimit);
      this.setData({
        patternPath: result.path,
        previewPath: result.previewPath,
        patternPixelW: result.patternPixelW,
        patternPixelH: result.patternPixelH,
        palette: result.palette,
        totalBeads: result.totalBeads,
        emptyCount: result.emptyCount,
        patternReady: true,
        patternStale: false,
        previewScale: 1,
        previewScaleText: '100%'
      }, () => this.layoutPreview(0));
      wx.showToast({ title: '图纸生成成功', icon: 'success' });
    } catch (err) {
      console.error('生成图纸失败', err);
      const empty = err && err.message === 'EMPTY_IMAGE';
      wx.showModal({
        title: '生成失败',
        content: empty
          ? '这张图片几乎是全透明的，没有可以转成豆子的内容。'
          : '请重新选择图片后再试。如果持续失败，请在微信开发者工具中检查 Canvas 相关错误。',
        showCancel: false
      });
    } finally {
      this.setData({ generating: false, useCanvas: false });
    }
  },

  processImage(width, height, colorLimit) {
    const page = this;
    const crop = sourceCrop(
      page.data.imageWidth,
      page.data.imageHeight,
      width,
      height,
      page.data.zoom,
      page.data.panX,
      page.data.panY
    );
    return new Promise((resolve, reject) => {
      const queryCanvas = (attempt) => {
        wx.createSelectorQuery().in(page).select('#workCanvas').fields({ node: true, size: true }).exec((res) => {
          const info = res && res[0];
          if ((!info || !info.node) && attempt < 2) {
            wx.nextTick(() => queryCanvas(attempt + 1));
            return;
          }
          page.drawOnCanvas(info, width, height, colorLimit, crop, resolve, reject);
        });
      };
      page.setData({ useCanvas: true }, () => wx.nextTick(() => queryCanvas(0)));
    });
  },

  drawOnCanvas(info, width, height, colorLimit, crop, resolve, reject) {
    const page = this;
    try {
      if (!info || !info.node) throw new Error('Canvas 2D 节点不可用');
      const canvas = info.node;
      const ctx = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;
      const img = canvas.createImage();
      img.onload = () => {
        try {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height).data;
          const pixels = [];
          for (let i = 0; i < imageData.length; i += 4) {
            if (imageData[i + 3] < 128) pixels.push(null);
            else pixels.push([imageData[i], imageData[i + 1], imageData[i + 2]]);
          }
          const result = buildBeadPattern({
            pixels,
            width,
            height,
            colorLimit,
            dither: !!page.data.dither,
            brandColors: MARD_COLORS
          });
          const spec = patternCanvasSize(width, height, result.palette.length);
          page.renderAndSave(canvas, spec, width, height, result)
            .then(resolve)
            .catch(reject);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = page.data.imagePath;
    } catch (e) {
      reject(e);
    }
  },

  renderAndSave(canvas, spec, gridWidth, gridHeight, result) {
    const page = this;
    const pack = (filePath, current) => ({
      path: filePath,
      previewPath: filePath,
      patternPixelW: current.canvasW,
      patternPixelH: current.canvasH,
      palette: result.palette,
      totalBeads: result.totalBeads,
      emptyCount: result.emptyCount
    });
    return page.paintCanvas(canvas, spec, gridWidth, gridHeight, result, true)
      .then(() => page.saveCanvasPng(canvas, false))
      .then((filePath) => pack(filePath, spec))
      .catch(() => {
        const cell = Math.max(4, Math.min(16, Math.floor(320 / Math.max(gridWidth, gridHeight))));
        const compact = {
          cell,
          patternW: gridWidth * cell,
          patternH: gridHeight * cell,
          canvasW: gridWidth * cell,
          canvasH: spec.headerH + gridHeight * cell,
          headerH: spec.headerH,
          legendH: 0,
          legendTitleH: spec.legendTitleH,
          rowH: spec.rowH,
          cols: 1
        };
        return page.paintCanvas(canvas, compact, gridWidth, gridHeight, result, false)
          .then(() => page.saveCanvasPng(canvas, true))
          .then((filePath) => pack(filePath, compact));
      });
  },

  paintCanvas(canvas, spec, gridWidth, gridHeight, result, withLegend) {
    canvas.width = spec.canvasW;
    canvas.height = spec.canvasH;
    const outCtx = canvas.getContext('2d');
    drawPattern(outCtx, spec, gridWidth, gridHeight, result, withLegend);
    return Promise.resolve();
  },

  saveCanvasPng(canvas, allowTempFile) {
    const base64 = this.canvasPngBase64(canvas);
    if (base64) return this.writeBase64Png(base64);
    if (allowTempFile) return this.exportCanvasPlain(canvas);
    return Promise.reject(new Error('EXPORT'));
  },

  canvasPngBase64(canvas) {
    if (typeof canvas.toDataURL !== 'function') return '';
    try {
      const dataUrl = canvas.toDataURL('image/png');
      if (!dataUrl) return '';
      const comma = dataUrl.indexOf(',');
      return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    } catch (err) {
      console.error('toDataURL failed', err);
      return '';
    }
  },

  writeBase64Png(base64) {
    const page = this;
    const filePath = `${wx.env.USER_DATA_PATH}/pindou-${Date.now()}.png`;
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().writeFile({
        filePath,
        data: base64,
        encoding: 'base64',
        success: () => {
          if (page._patternFile && page._patternFile !== filePath) {
            wx.getFileSystemManager().unlink({ filePath: page._patternFile, fail() {} });
          }
          page._patternFile = filePath;
          resolve(filePath);
        },
        fail: reject
      });
    });
  },

  exportCanvasPlain(canvas) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      }, this);
    });
  },

  layoutPreview(attempt) {
    const page = this;
    wx.nextTick(() => {
      wx.createSelectorQuery().in(page).select('.pattern-viewport').boundingClientRect((rect) => {
        if ((!rect || !rect.width) && attempt < 2) {
          page.layoutPreview(attempt + 1);
          return;
        }
        if (!rect || !rect.width || !page.data.patternPixelW) return;
        const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : { windowHeight: 700 };
        const areaH = Math.max(280, Math.min(Math.round(windowInfo.windowHeight * 0.58), 640));
        const fit = fitPreview(rect.width, areaH, page.data.patternPixelW, page.data.patternPixelH);
        const grid = Number(page.data.gridWidth) || 1;
        const cellAtFit = fit.baseW / grid;
        const maxScale = Math.max(3, Math.min(12, 36 / Math.max(cellAtFit, 1)));
        page._preview = {
          areaW: rect.width,
          areaH,
          baseW: fit.baseW,
          baseH: fit.baseH,
          maxScale
        };
        page._previewRect = { left: rect.left, top: rect.top };
        page.setData({
          previewAreaH: areaH,
          previewBaseW: fit.baseW,
          previewBaseH: fit.baseH,
          previewTx: fit.tx,
          previewTy: fit.ty,
          previewScale: 1,
          previewScaleText: '100%'
        });
      }).exec();
    });
  },

  setPreviewScale(nextScale) {
    const box = this._preview;
    if (!box) return;
    const prev = this.data.previewScale || 1;
    const scale = Math.max(1, Math.min(box.maxScale, nextScale));
    const cx = box.areaW / 2;
    const cy = box.areaH / 2;
    const ix = (cx - this.data.previewTx) / prev;
    const iy = (cy - this.data.previewTy) / prev;
    const pan = clampPreviewPan(
      cx - ix * scale,
      cy - iy * scale,
      box.areaW,
      box.areaH,
      box.baseW * scale,
      box.baseH * scale
    );
    this.setData({
      previewScale: Math.round(scale * 100) / 100,
      previewTx: Math.round(pan.tx),
      previewTy: Math.round(pan.ty),
      previewScaleText: Math.round(scale * 100) + '%'
    });
  },

  previewZoomIn() {
    this.setPreviewScale((this.data.previewScale || 1) * 1.4);
  },

  previewZoomOut() {
    this.setPreviewScale((this.data.previewScale || 1) / 1.4);
  },

  previewFit() {
    this.setPreviewScale(1);
  },

  previewReadNumbers() {
    const box = this._preview;
    if (!box) return;
    const grid = Number(this.data.gridWidth) || 1;
    this.setPreviewScale(28 / (box.baseW / grid));
  },

  onPreviewTouchStart(e) {
    const touches = e.touches || [];
    if (!touches.length) return;
    this._gesture = {
      scale: this.data.previewScale || 1,
      tx: this.data.previewTx,
      ty: this.data.previewTy,
      x0: touches[0].clientX,
      y0: touches[0].clientY,
      dist: touches.length > 1 ? this.touchDistance(touches[0], touches[1]) : 0,
      midX: touches.length > 1 ? (touches[0].clientX + touches[1].clientX) / 2 : 0,
      midY: touches.length > 1 ? (touches[0].clientY + touches[1].clientY) / 2 : 0
    };
    wx.createSelectorQuery().in(this).select('.pattern-viewport').boundingClientRect((rect) => {
      if (rect) this._previewRect = { left: rect.left, top: rect.top };
    }).exec();
  },

  onPreviewTouchMove(e) {
    const gesture = this._gesture;
    const box = this._preview;
    const rect = this._previewRect;
    const touches = e.touches || [];
    if (!gesture || !box || !rect || !touches.length) return;
    if (touches.length >= 2 && gesture.dist) {
      const distNow = this.touchDistance(touches[0], touches[1]);
      const scale = Math.max(1, Math.min(box.maxScale, gesture.scale * (distNow / gesture.dist)));
      const ix = (gesture.midX - rect.left - gesture.tx) / gesture.scale;
      const iy = (gesture.midY - rect.top - gesture.ty) / gesture.scale;
      const midX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
      const midY = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
      const pan = clampPreviewPan(
        midX - ix * scale,
        midY - iy * scale,
        box.areaW,
        box.areaH,
        box.baseW * scale,
        box.baseH * scale
      );
      this.setData({
        previewScale: Math.round(scale * 100) / 100,
        previewTx: Math.round(pan.tx),
        previewTy: Math.round(pan.ty),
        previewScaleText: Math.round(scale * 100) + '%'
      });
      return;
    }
    const viewW = box.baseW * gesture.scale;
    const viewH = box.baseH * gesture.scale;
    const pan = clampPreviewPan(
      gesture.tx + touches[0].clientX - gesture.x0,
      gesture.ty + touches[0].clientY - gesture.y0,
      box.areaW,
      box.areaH,
      viewW,
      viewH
    );
    this.setData({
      previewTx: Math.round(pan.tx),
      previewTy: Math.round(pan.ty)
    });
  },

  onPreviewTouchEnd(e) {
    if (e.touches && e.touches.length) {
      this.onPreviewTouchStart(e);
      return;
    }
    this._gesture = null;
  },

  touchDistance(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  },

  savePattern() {
    if (!this.data.patternPath || this.data.exporting) return;
    this.writeAlbum();
  },

  writeAlbum() {
    this.setData({ exporting: true });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.patternPath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if ((err && err.errno === 112) || msg.indexOf('not declared') >= 0) {
          this.showPrivacyScopeError('save');
          return;
        }
        if (msg.indexOf('privacy') >= 0) {
          wx.showToast({ title: '需先同意隐私保护指引', icon: 'none' });
          return;
        }
        if (msg.indexOf('auth deny') >= 0 || msg.indexOf('auth denied') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册。',
            confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting({}); }
          });
          return;
        }
        wx.showModal({
          title: '无法直接保存',
          content: '可长按图纸预览图片，选择保存图片。真机使用时请检查相册权限。',
          showCancel: false
        });
      },
      complete: () => this.setData({ exporting: false })
    });
  },

  openPrivacyPopup(resolve) {
    if (this._privacyResolve) {
      resolve({ event: 'disagree' });
      return;
    }
    this._privacyResolve = resolve;
    this.setData({ showPrivacy: true });
  },

  handleAgreePrivacyAuthorization() {
    const resolve = this._privacyResolve;
    this._privacyResolve = null;
    this.setData({ showPrivacy: false });
    if (typeof resolve === 'function') {
      resolve({ buttonId: 'agree-btn', event: 'agree' });
    }
  },

  handleDisagreePrivacy() {
    const resolve = this._privacyResolve;
    this._privacyResolve = null;
    this.setData({ showPrivacy: false });
    if (typeof resolve === 'function') resolve({ event: 'disagree' });
  },

  showPrivacyScopeError(kind) {
    const content = kind === 'save'
      ? '请到微信公众平台 → 设置 → 用户隐私保护指引，勾选「相册（仅写入）」，用途填写保存拼豆图纸。保存后约 5 分钟生效，再重新编译。'
      : '请到微信公众平台 → 设置 → 用户隐私保护指引，勾选「收集你选中的照片或视频信息」，用途填写把照片转成拼豆图纸。若要拍摄，再勾选「访问你的摄像头」。保存后约 5 分钟生效，再重新编译。';
    wx.showModal({
      title: '隐私指引还没声明这项',
      content,
      showCancel: false
    });
  },

  handleOpenPrivacyContract() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '当前基础库无法打开隐私指引', icon: 'none' });
      return;
    }
    wx.openPrivacyContract({
      fail: () => wx.showToast({ title: '请先在小程序后台配置隐私保护指引', icon: 'none' })
    });
  }
});
