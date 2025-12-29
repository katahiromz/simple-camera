import { readBarcodesFromImageData, type ReaderOptions } from 'zxing-wasm/reader';

export interface QRResult {
  data: string;
  location: {
    points: { x: number, y: number }[] // 座標を配列で保持
  };
}

// キャンバスを複製する
export const cloneCanvas = (oldCanvas: HTMLCanvasElement) => {
  let newCanvas = document.createElement('canvas');
  newCanvas.width = oldCanvas.width;
  newCanvas.height = oldCanvas.height;
  let ctx = newCanvas.getContext('2d');
  ctx?.drawImage(oldCanvas, 0, 0);
  return newCanvas;
};

export class CodeReader {
  // WASMをウォームアップさせる静的メソッド
  // 内部でダミーデータを読み込み、ランタイムを初期化します。
  static async warmup(): Promise<void> {
    try {
      const dummyData = new ImageData(1, 1);
      // zxing-wasmの初期化を促す
      await readBarcodesFromImageData(dummyData, { formats: ['QRCode'] });
      console.log('zxing-wasm warmed up');
    } catch (e) {
      // 初回ロード時は内部的に例外を投げる可能性があるため、ログ出力に留める
      console.warn('zxing-wasm warmup notice:', e);
    }
  }

  // @zxing/library の頂点の配置が不格好なので、正方形になるよう補正
  static fixPoints(p0: { x: number, y: number }[]): { x: number, y: number }[] {
    // まずは元のロジックで4点目を計算
    const points = [p0[0], p0[1], p0[2]];
    let dx0 = p0[1].x - p0[0].x, dy0 = p0[1].y - p0[0].y;
    let dx1 = p0[2].x - p0[0].x, dy1 = p0[2].y - p0[0].y;
    points.push({ x: p0[0].x - dx0 + dx1, y: p0[0].y - dy0 + dy1 });
    // 重心を求める
    const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
    const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
    // 各頂点を中心から遠ざける
    const scale = 1.07;
    return points.map(p => ({
      x: cx + (p.x - cx) * scale,
      y: cy + (p.y - cy) * scale
    }));
  }

  // 複数のQRコードの検出が可能
  static async scanMultiple(canvas: HTMLCanvasElement): Promise<QRResult[]> {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // ImageDataを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // zxing-wasmでバーコードを読み取る
      const results = await readBarcodesFromImageData(imageData, {
        formats: ['QRCode'],
        tryHarder: false,
        maxNumberOfSymbols: 8,
      });

      // 結果を変換
      return results.map(result => {
        // zxing-wasmの座標を取得
        const position = result.position;
        const points = [
          { x: position.topLeft.x, y: position.topLeft.y },
          { x: position.topRight.x, y: position.topRight.y },
          { x: position.bottomRight.x, y: position.bottomRight.y },
          { x: position.bottomLeft.x, y: position.bottomLeft.y }
        ];

        let fixedPoints = CodeReader.fixPoints(points);

        return {
          data: result.text,
          location: {
            points: fixedPoints
          }
        };
      });
    } catch (e) {
      console.log('Scan error:', e);
      return [];
    }
  }

  // 枠(ボックス)を描画する
  static drawQRBox(ctx: CanvasRenderingContext2D, result: QRResult, debug = false) {
    if (!result || !result.location || !result.location.points) {
      return;
    }
    const points = result.location.points;
    ctx.save();

    // 通常の枠描画
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#009900"; // 緑色
    ctx.stroke();

    let fontSize = 15;
    ctx.font = `${fontSize}px sans-serif`;

    let data = result.data;
    let measure = ctx.measureText(data);
    for (let i = 0; i < 50; ++i) {
      if (measure.width < (points[2].x - points[0].x) * 1.6)
        break;
      data = data.substring(0, data.length - 4) + '...';
      measure = ctx.measureText(data);
    }

    // 文字列
    ctx.fillStyle = "#009900"; // 緑色
    ctx.fillText(data, (points[0].x + points[2].x - measure.width) / 2, points[0].y - ctx.lineWidth - fontSize * 0.2);
    ctx.restore();
  }

  // 複数のQRボックスを一度に描画する
  static drawAllBoxes(ctx: CanvasRenderingContext2D, results: QRResult[]) {
    results.forEach(res => this.drawQRBox(ctx, res));
  }

  // 文字列からURLをすべて抽出して配列で返す
  static extractUrls(text: string): string[] {
    // URLにマッチする正規表現
    const urlPattern = /https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+/g;
    // マッチするものがない場合は空の配列を返す
    return text.match(urlPattern) || [];
  }
}