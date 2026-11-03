const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_BYTES = 1024 * 1024;

exports.main = async (event) => {
  const fileID = event && event.fileID;
  if (!fileID) return { pass: false, errCode: 400, errMsg: 'missing fileID' };

  const downloaded = await cloud.downloadFile({ fileID });
  const buffer = downloaded && downloaded.fileContent;
  if (!buffer || !buffer.length || buffer.length > MAX_BYTES) {
    return { pass: false, errCode: 400, errMsg: 'image too large' };
  }

  try {
    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: event.contentType || 'image/jpeg',
        value: buffer
      }
    });
    const code = result && result.errCode !== undefined ? result.errCode : 0;
    return { pass: code === 0, errCode: code };
  } catch (err) {
    const code = err.errCode || err.errcode;
    if (code === 87014) return { pass: false, errCode: 87014 };
    return { pass: false, errCode: code || 500, errMsg: err.errMsg || err.message || 'check failed' };
  }
};
