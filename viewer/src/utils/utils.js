/**
 * 
 * @param {string} url 
 * @param {string} title
 * @param {number} w
 * @param {number} h
 * @returns {Window | null}
 */
const openOauthPopupWindow = (url, title, w = 700, h = 800) => {
  const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
  const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;

  const width = window.innerWidth
    ? window.innerWidth
    : document.documentElement.clientWidth
      ? document.documentElement.clientWidth
      : window.screen.width;

  const height = window.innerHeight
    ? window.innerHeight
    : document.documentElement.clientHeight
      ? document.documentElement.clientHeight
      : window.screen.height;

  const left = width / 2 - w / 2 + dualScreenLeft;
  const top = height / 2 - h / 2 + dualScreenTop;

  let popup = window.open(
    url,
    title || 'Visivo',
    `scrollbars=yes, width=${w}, height=${h}, top=${top}, left=${left}`
  );

  if (popup && popup.focus) {
    popup.focus();
  }

  // Handle PopUp blocked
  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    popup = window.open(url, '_blank')
  }

  return popup;
}

export { openOauthPopupWindow }
