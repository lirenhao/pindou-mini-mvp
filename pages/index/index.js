const { MARD_COLORS, MARD_PALETTE_NAME } = require('../../utils/mard-palette.js');
const { buildBeadPattern, sourceCrop, coverFrame, coverPlacement, patternCanvasSize } = require('../../utils/pattern.js');

const MAX_DIMENSION = 100;

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function ink(r, g, b) {
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#2A241F' : '#FFFFFF';
}

function pixelRatio() {
  if (typeof wx.getWindowInfo === 'function') {
    const info = wx.getWindowInfo();
    if (info && info.pixelRatio) return info.pixelRatio;
  }
  return 2;
}

function drawPattern(ctx, spec, gridWidth, gridHeight, result) {
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
    patternDisplayWidth: 0,
    palette: [],
    totalBeads: 0,
    emptyCount: 0,
    showPrivacy: false
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
    this.ensurePrivacy()
      .then(() => this.pickImage())
      .catch(() => {
        wx.showToast({ title: '需同意隐私指引后才能继续', icon: 'none' });
      });
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
        if (msg.indexOf('privacy') >= 0) {
          wx.showToast({ title: '请先同意隐私指引，或在后台完成配置', icon: 'none' });
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
        patternDisplayWidth: result.displayWidth,
        palette: result.palette,
        totalBeads: result.totalBeads,
        emptyCount: result.emptyCount,
        patternReady: true,
        patternStale: false
      });
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
      this.setData({ generating: false });
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
      wx.createSelectorQuery().in(page).select('#workCanvas').fields({ node: true, size: true }).exec((res) => {
        try {
          const info = res && res[0];
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
              canvas.width = spec.canvasW;
              canvas.height = spec.canvasH;
              const outCtx = canvas.getContext('2d');
              drawPattern(outCtx, spec, width, height, result);
              const ratio = Math.max(1, Math.min(2, pixelRatio()));
              const exportScale = Math.min(ratio, 4096 / spec.canvasW, 4096 / spec.canvasH);
              wx.canvasToTempFilePath({
                canvas,
                x: 0,
                y: 0,
                width: spec.canvasW,
                height: spec.canvasH,
                destWidth: Math.round(spec.canvasW * exportScale),
                destHeight: Math.round(spec.canvasH * exportScale),
                fileType: 'png',
                success: (fileRes) => resolve({
                  path: fileRes.tempFilePath,
                  palette: result.palette,
                  totalBeads: result.totalBeads,
                  emptyCount: result.emptyCount,
                  displayWidth: spec.canvasW
                }),
                fail: reject
              }, page);
            } catch (e) {
              reject(e);
            }
          };
          img.onerror = () => reject(new Error('图片加载失败'));
          img.src = page.data.imagePath;
        } catch (e) {
          reject(e);
        }
      });
    });
  },

  savePattern() {
    if (!this.data.patternPath || this.data.exporting) return;
    this.ensurePrivacy()
      .then(() => this.writeAlbum())
      .catch(() => {
        wx.showToast({ title: '需同意隐私指引后才能保存', icon: 'none' });
      });
  },

  writeAlbum() {
    this.setData({ exporting: true });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.patternPath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('privacy') >= 0) {
          wx.showToast({ title: '需同意隐私指引后才能保存', icon: 'none' });
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

  handleOpenPrivacyContract() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '当前基础库无法打开隐私指引', icon: 'none' });
      return;
    }
    wx.openPrivacyContract({
      fail: () => wx.showToast({ title: '请先在小程序后台配置隐私保护指引', icon: 'none' })
    });
  },

  ensurePrivacy() {
    return new Promise((resolve, reject) => {
      if (typeof wx.requirePrivacyAuthorize !== 'function') {
        resolve();
        return;
      }
      wx.requirePrivacyAuthorize({
        success: () => resolve(),
        fail: () => reject(new Error('PRIVACY_DECLINED'))
      });
    });
  }
});
