// App.tsx --- アプリのTypeScriptソース
import React, { useRef, useState, useEffect, useCallback } from 'react';
import AdvancedCamera from './components/AdvancedCamera.tsx';
import Camera02 from './components/Camera02.tsx';
import { emulateInsets } from './utils.ts';
import './App.css';

// 製品版か？
const IS_PRODUCTION = import.meta.env.MODE === 'production';

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// アプリ
function App() {
  if (!IS_PRODUCTION) { // 本番環境ではない場合、
    emulateInsets(); // insetsをエミュレートする
  }
  
  //const dummyImageSrc = !IS_PRODUCTION ? `${BASE_URL}dummy.jpg` : null; // 非本番環境ではダミー画像のパスを指定
  //const dummyImageSrc = !IS_PRODUCTION ? `${BASE_URL}example-qr-code.png` : null; // 非本番環境ではQRコード画像のパスを指定
  const dummyImageSrc = null; // ダミー画像を使わない

  if (false) {
    return (
      <AdvancedCamera dummyImageSrc={dummyImageSrc} autoMirror="{true}" />
    );
  } else {
    return (
      <Camera02></Camera02>
    );
  }
}

export default App;