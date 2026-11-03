function callCloud(name, data) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
      reject(new Error('NO_CLOUD'));
      return;
    }
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => resolve(res.result || {}),
      fail: reject
    });
  });
}

function interpret(result) {
  if (!result || result.pass !== true) {
    if (result && result.errCode === 87014) return false;
    const error = new Error((result && result.errMsg) || 'CHECK_FAILED');
    error.errCode = result && result.errCode;
    throw error;
  }
  return true;
}

function compressOnce(src, quality) {
  return new Promise((resolve) => {
    if (typeof wx.compressImage !== 'function') {
      resolve(src);
      return;
    }
    wx.compressImage({
      src,
      quality,
      success: (res) => resolve((res && res.tempFilePath) || src),
      fail: () => resolve(src)
    });
  });
}

function fileSize(filePath) {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath,
      success: (info) => resolve(info.size || 0),
      fail: () => resolve(0)
    });
  });
}

function compressForCheck(filePath) {
  return compressOnce(filePath, 80).then((src) => {
    return fileSize(src).then((size) => {
      if (size > 0 && size <= 900 * 1024) return src;
      return compressOnce(src, 30);
    });
  });
}

function uploadFile(cloudPath, filePath) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: resolve,
      fail: reject
    });
  });
}

function deleteCloudFile(fileID) {
  if (!fileID || !wx.cloud || typeof wx.cloud.deleteFile !== 'function') return;
  wx.cloud.deleteFile({ fileList: [fileID], fail() {} });
}

function checkImage(filePath) {
  return compressForCheck(filePath).then((src) => {
    return fileSize(src).then((size) => {
      if (size > 1024 * 1024) {
        const error = new Error('IMAGE_TOO_LARGE');
        throw error;
      }
      const cloudPath = 'sec-check/' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '.jpg';
      return uploadFile(cloudPath, src).then((upload) => {
        const fileID = upload && upload.fileID;
        return callCloud('imgSecCheck', { fileID, contentType: 'image/jpeg' }).then((result) => {
          deleteCloudFile(fileID);
          return interpret(result);
        }).catch((err) => {
          deleteCloudFile(fileID);
          throw err;
        });
      });
    });
  });
}

function checkText(content) {
  const text = String(content || '').trim().slice(0, 2500);
  if (!text) return Promise.resolve(true);
  return callCloud('msgSecCheck', { content: text }).then(interpret);
}

module.exports = {
  checkImage,
  checkText
};
