// utils.ts
// 汎用のユーティリティ関数は utils.ts に分離

export const isAndroidApp = typeof window.android !== 'undefined';

// insetsをエミュレートする
export const emulateInsets = () => {
  let custom = { top: 30, bottom: 30, left: 30, right: 30 };
  // デバイスプリセット
  const presets = {
    'iPhone X-13': { top: 44, bottom: 34, left: 0, right: 0 },
    'iPhone 14 Pro+': { top: 59, bottom: 34, left: 0, right: 0 },
    'iPhone 15 Pro': { top: 59, bottom: 34, left: 0, right: 0 },
    'Android': { top: 0, bottom: 24, left: 0, right: 0 },
    'iPad Pro': { top: 24, bottom: 20, left: 0, right: 0 },
    'なし': { top: 0, bottom: 0, left: 0, right: 0 },
    'カスタム': custom
  };
  // CSS変数を更新
  //const values = presets['カスタム'];
  const values = presets['なし'];
  document.documentElement.style.setProperty('--safe-inset-top', `${values.top}px`);
  document.documentElement.style.setProperty('--safe-inset-bottom', `${values.bottom}px`);
  document.documentElement.style.setProperty('--safe-inset-left', `${values.left}px`);
  document.documentElement.style.setProperty('--safe-inset-right', `${values.right}px`);
};
