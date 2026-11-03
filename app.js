App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({ traceUser: true });
    }
    if (typeof wx.onNeedPrivacyAuthorization !== 'function') return;
    wx.onNeedPrivacyAuthorization((resolve) => {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page && typeof page.openPrivacyPopup === 'function') {
        page.openPrivacyPopup(resolve);
        return;
      }
      resolve({ event: 'disagree' });
    });
  }
});
