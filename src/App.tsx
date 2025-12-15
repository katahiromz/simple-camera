// App.tsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
import AdvancedCamera from './components/AdvancedCamera.tsx';
import { emulateInsets } from './utils.ts';
import './App.css';

// 製品版か？
const IS_PRODUCTION = import.meta.env.MODE === 'production';

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// アプリ
function App() {
  // 本番環境ではない場合、insetsをエミュレートする
  if (!IS_PRODUCTION) { emulateInsets(); }
  return (
    <AdvancedCamera></AdvancedCamera>
  );
}

export default App;