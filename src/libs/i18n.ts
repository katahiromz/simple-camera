// 翻訳・国際化(i18n)用
// Author: katahiromz
// License: MIT

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';

const BASE_URL = import.meta.env.BASE_URL || '/';

export const supportedLngs = {
  ja: '日本語',
  en: 'English'
};

i18n
  .use(HttpApi) // 翻訳ファイルを非同期に読み込むため
  .use(LanguageDetector) // ユーザーの言語設定を検知するため
  .use(initReactI18next) // i18next インスタンスを初期化
  .init({
    returnEmptyString: true, // 空文字での定義を許可に
    supportedLngs: Object.keys(supportedLngs),
    debug: false,

    backend: {
      // 翻訳ファイルを読み込むパス
      // {{lng}} は現在の言語 ('ja')、{{ns}} は名前空間 ('translation') に置き換わる
      loadPath: BASE_URL + 'locales/{{lng}}/{{ns}}.json',
    },

    interpolation: {
      escapeValue: false, // ReactではXSS対策が組み込まれているため不要
    },
  });

export default i18n;
