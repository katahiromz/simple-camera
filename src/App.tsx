// App.tsx --- アプリのTypeScriptソース
import React from 'react';
import SimpleCamera from './components/SimpleCamera.tsx';
import { emulateInsets } from './utils.ts';
import './App.css';

// 製品版か？
const IS_PRODUCTION = import.meta.env.MODE === 'production';

// アプリ
function App() {
  if (!IS_PRODUCTION) { // 本番環境ではない場合、
    emulateInsets(); // insetsをエミュレートする
  }

  return (
    <SimpleCamera />
  );
}

export default App;