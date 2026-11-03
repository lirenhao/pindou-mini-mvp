const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const content = String((event && event.content) || '').trim().slice(0, 2500);
  if (!content) return { pass: true };
  const openid = cloud.getWXContext().OPENID;
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      openid,
      scene: 1,
      version: 2,
      content
    });
    const suggest = result && result.result && result.result.suggest;
    const risky = suggest === 'risky' || suggest === 'review';
    return { pass: !risky, errCode: risky ? 87014 : 0, suggest: suggest || 'pass' };
  } catch (err) {
    const code = err.errCode || err.errcode;
    if (code === 87014) return { pass: false, errCode: 87014 };
    return { pass: false, errCode: code || 500, errMsg: err.errMsg || err.message || 'check failed' };
  }
};
