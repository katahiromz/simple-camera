import {
  BrowserQRCodeReader,
  HTMLCanvasElementLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  MultiFormatReader,
} from '@zxing/library';

export interface QRResult {
  data: string;
  location: {
    points: { x: number, y: number }[] // 座標を配列で保持
  };
}

// キャンバスを複製する
export const cloneCanvas = (oldCanvas) => {
  let newCanvas = document.createElement('canvas');
  newCanvas.width = oldCanvas.width;
  newCanvas.height = oldCanvas.height;
  let ctx = newCanvas.getContext('2d');
  ctx.drawImage(oldCanvas, 0, 0);
  return newCanvas;
};

export class CodeReader {
  private static reader = new BrowserQRCodeReader();

  // 複数スキャン用にヒントを設定（必要に応じて）
  private static hints = new Map([[DecodeHintType.TRY_HARDER, true]]);

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
    const scale = 1.5;
    return points.map(p => ({
      x: cx + (p.x - cx) * scale,
      y: cy + (p.y - cy) * scale
    }));
  }

  // 1つのQRコードを検出
  static async scanSingle(canvas: HTMLCanvasElement): Promise<QRResult | null> {
    try {
      const source = new HTMLCanvasElementLuminanceSource(canvas);
      const binarizer = new HybridBinarizer(source);
      const bitmap = new BinaryBitmap(binarizer);

      const result = await this.reader.decodeBitmap(bitmap);
      const text = result.getText();

      const resultPoints = result.getResultPoints();
      const points = resultPoints.map(p => ({ x: p.getX(), y: p.getY() }));
      console.assert(points.length == 4);

      const fixedPoints = CodeReader.fixPoints(points);
      console.assert(fixedPoints.length == 4);

      return {
        data: text,
        location: { points: fixedPoints },
      };
    } catch (err) {
      // 検出されない時はここを通る
      return null;
    }
  }

  // 複数のQRコードの検出が可能
  static async scanMultiple(canvas: HTMLCanvasElement): Promise<QRResult[]> {
    const results: QRResult[] = [];
    const workingCanvas = cloneCanvas(canvas);
    const ctx = workingCanvas.getContext('2d');
    if (!ctx) return [];

    while (results.length < 10) { // 最大10個
      const result = await this.scanSingle(workingCanvas);
      if (!result) break;

      results.push(result);

      const p = result.location.points;

      // マスキング処理
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) {
        ctx.lineTo(p[i].x, p[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = "black";
      ctx.fill();
    }

    return results;
  }

  // 枠（ボックス）を描画する
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

    ctx.lineWidth = 4;
    ctx.strokeStyle = "#009900";
    ctx.stroke();

    // デバッグモード：各頂点に番号を表示
    if (true) {
      ctx.fillStyle = "#ff0000";
      ctx.font = "12px monospace";
      points.forEach((p, i) => {
        ctx.fillText(`${i}`, p.x - 5, p.y - 5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.fillStyle = "#009900";
    ctx.font = "15px san-serif";
    ctx.fillText(result.data, points[1].x, points[1].y - ctx.lineWidth * 1.2);

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