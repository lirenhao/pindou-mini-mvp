const CELL = 12;
const MAX_DIMENSION = 100;

Page({
  data: {
    imagePath: '',
    gridWidth: '29',
    gridHeight: '29',
    colorLimit: '12',
    generating: false,
    exporting: false,
    patternReady: false,
    patternPath: '',
    palette: [],
    totalBeads: 0
  },

  onWidthInput(e) { this.setData({ gridWidth: e.detail.value }); },
  onHeightInput(e) { this.setData({ gridHeight: e.detail.value }); },
  onColorInput(e) { this.setData({ colorLimit: e.detail.value }); },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this.setData({
          imagePath: file.tempFilePath,
          patternReady: false,
          patternPath: '',
          palette: [],
          totalBeads: 0
        });
      },
      fail: (err) => {
        if (err && err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '未能选择图片', icon: 'none' });
        }
      }
    });
  },

  clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  },

  async generatePattern() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先选择一张图片', icon: 'none' });
      return;
    }
    const width = this.clampInt(this.data.gridWidth, 29, 5, MAX_DIMENSION);
    const height = this.clampInt(this.data.gridHeight, 29, 5, MAX_DIMENSION);
    const colorLimit = this.clampInt(this.data.colorLimit, 12, 2, 32);
    this.setData({
      gridWidth: String(width),
      gridHeight: String(height),
      colorLimit: String(colorLimit),
      generating: true
    });

    try {
      const result = await this.processImage(width, height, colorLimit);
      this.setData({
        patternPath: result.path,
        palette: result.palette,
        totalBeads: width * height,
        patternReady: true
      });
      wx.showToast({ title: '图纸生成成功', icon: 'success' });
    } catch (err) {
      console.error('生成图纸失败', err);
      wx.showModal({
        title: '生成失败',
        content: '请重新选择图片后再试。如果持续失败，请在微信开发者工具中检查 Canvas 相关错误。',
        showCancel: false
      });
    } finally {
      this.setData({ generating: false });
    }
  },

  processImage(width, height, colorLimit) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery().in(this);
      query.select('#workCanvas').fields({ node: true, size: true }).exec((res) => {
        try {
          const info = res && res[0];
          if (!info || !info.node) throw new Error('Canvas 2D 节点不可用');
          const canvas = info.node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio || 1;

          // 以图纸格数为像素尺寸采样；用 cover 居中裁剪，填满图纸。
          canvas.width = width;
          canvas.height = height;
          const img = canvas.createImage();
          img.onload = () => {
            try {
              ctx.clearRect(0, 0, width, height);
              const scale = Math.max(width / img.width, height / img.height);
              const sw = width / scale;
              const sh = height / scale;
              const sx = (img.width - sw) / 2;
              const sy = (img.height - sh) / 2;
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
              const imageData = ctx.getImageData(0, 0, width, height).data;
              const pixels = [];
              for (let i = 0; i < imageData.length; i += 4) {
                pixels.push([imageData[i], imageData[i + 1], imageData[i + 2]]);
              }
              const quantized = this.quantizeColors(pixels, colorLimit);
              const colorMap = new Map();
              quantized.pixels.forEach((rgb) => {
                const hex = this.rgbToHex(rgb);
                const prev = colorMap.get(hex) || { r: rgb[0], g: rgb[1], b: rgb[2], hex, count: 0 };
                prev.count += 1;
                colorMap.set(hex, prev);
              });
              const palette = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);
              const lookup = new Map(palette.map((p, i) => [p.hex, i + 1]));

              // 输出图纸：每格放大为 CELL×CELL，并绘制细网格。
              const out = canvas;
              out.width = width * CELL;
              out.height = height * CELL;
              const outCtx = out.getContext('2d');
              outCtx.fillStyle = '#ffffff';
              outCtx.fillRect(0, 0, out.width, out.height);
              quantized.pixels.forEach((rgb, idx) => {
                const x = idx % width;
                const y = Math.floor(idx / width);
                outCtx.fillStyle = this.rgbToHex(rgb);
                outCtx.fillRect(x * CELL, y * CELL, CELL, CELL);
              });
              outCtx.strokeStyle = 'rgba(45, 39, 35, 0.35)';
              outCtx.lineWidth = 0.6;
              outCtx.beginPath();
              for (let x = 0; x <= width; x++) {
                outCtx.moveTo(x * CELL + 0.3, 0);
                outCtx.lineTo(x * CELL + 0.3, out.height);
              }
              for (let y = 0; y <= height; y++) {
                outCtx.moveTo(0, y * CELL + 0.3);
                outCtx.lineTo(out.width, y * CELL + 0.3);
              }
              outCtx.stroke();

              // 为了让颜色编号可读，MVP 将颜色编号作为清单；图纸格内不叠加数字。
              wx.canvasToTempFilePath({
                canvas: out,
                x: 0, y: 0, width: out.width, height: out.height,
                destWidth: out.width * Math.max(1, Math.min(2, dpr)),
                destHeight: out.height * Math.max(1, Math.min(2, dpr)),
                fileType: 'png',
                success: (fileRes) => resolve({ path: fileRes.tempFilePath, palette }),
                fail: reject
              }, this);
            } catch (e) { reject(e); }
          };
          img.onerror = () => reject(new Error('图片加载失败'));
          img.src = this.data.imagePath;
        } catch (e) { reject(e); }
      });
    });
  },

  quantizeColors(pixels, k) {
    // 确定性、轻量级 k-means：适用于 MVP 的小尺寸图纸。
    const unique = [];
    const seen = new Set();
    pixels.forEach(p => {
      const key = p.join(',');
      if (!seen.has(key)) { seen.add(key); unique.push(p); }
    });
    if (unique.length <= k) return { pixels: pixels.map(p => p.slice()) };

    const centers = [];
    // 使用最远点初始化，尽量让初始中心分散。
    centers.push(unique[0].slice());
    while (centers.length < Math.min(k, unique.length)) {
      let best = null, bestDist = -1;
      unique.forEach(p => {
        let nearest = Infinity;
        centers.forEach(c => {
          const d = this.colorDistanceSq(p, c);
          if (d < nearest) nearest = d;
        });
        if (nearest > bestDist) { bestDist = nearest; best = p; }
      });
      centers.push(best.slice());
    }

    let assignments = new Array(pixels.length).fill(0);
    for (let iter = 0; iter < 8; iter++) {
      const sums = centers.map(() => [0, 0, 0, 0]);
      pixels.forEach((p, i) => {
        let best = 0, dist = Infinity;
        centers.forEach((c, j) => {
          const d = this.colorDistanceSq(p, c);
          if (d < dist) { dist = d; best = j; }
        });
        assignments[i] = best;
        sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
      });
      sums.forEach((s, i) => {
        if (s[3]) centers[i] = [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])];
      });
    }
    const finalPixels = pixels.map(p => {
      let best = centers[0], dist = Infinity;
      centers.forEach(c => {
        const d = this.colorDistanceSq(p, c);
        if (d < dist) { dist = d; best = c; }
      });
      return best.slice();
    });
    return { pixels: finalPixels };
  },

  colorDistanceSq(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    // 加权 RGB 距离，比纯欧氏距离更照顾绿色通道。
    return 0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db;
  },

  rgbToHex(rgb) {
    return '#' + rgb.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
  },

  savePattern() {
    if (!this.data.patternPath) return;
    this.setData({ exporting: true });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.patternPath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (err) => {
        if (err && (err.errMsg || '').includes('auth deny')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册。',
            confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting({}); }
          });
        } else {
          // 模拟器或开发工具不支持保存时，仍可在预览图上长按保存。
          wx.showModal({
            title: '无法直接保存',
            content: '可长按图纸预览图片，选择保存图片。真机使用时请检查相册权限。',
            showCancel: false
          });
        }
      },
      complete: () => this.setData({ exporting: false })
    });
  }
});
