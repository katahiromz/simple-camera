import React, { useRef, useState, useEffect, useCallback } from 'react';
import AdvancedCamera from './components/AdvancedCamera.tsx';
import './App.css';

// 製品版か？
const IS_PRODUCTION = import.meta.env.MODE === 'production';

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// アプリ
function App() {
  return (
    <AdvancedCamera>
    </AdvancedCamera>
  );
}

export default App;