// jsqrScanner.ts --- jsQR wrapper for QR code detection
import jsQR from 'jsqr';

/**
 * QR code detection result interface
 */
export interface QRDetectionResult {
  /** Decoded QR code text */
  rawValue: string;
  /** Bounding box of detected QR code */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Detects QR code from ImageData using jsQR library
 * 
 * @param imageData - ImageData object from canvas getImageData()
 * @returns QR detection result or null if no QR code detected
 * 
 * @example
 * ```typescript
 * const canvas = document.createElement('canvas');
 * const ctx = canvas.getContext('2d');
 * const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
 * const result = detectFromImageData(imageData);
 * if (result) {
 *   console.log('QR code detected:', result.rawValue);
 * }
 * ```
 */
export function detectFromImageData(imageData: ImageData): QRDetectionResult | null {
  try {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert', // Optimization: don't try inverted colors
    });

    if (!code) {
      return null;
    }

    // Calculate bounding box from the location points
    const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = code.location;
    
    // Find min/max x and y coordinates
    const xCoords = [topLeftCorner.x, topRightCorner.x, bottomLeftCorner.x, bottomRightCorner.x];
    const yCoords = [topLeftCorner.y, topRightCorner.y, bottomLeftCorner.y, bottomRightCorner.y];
    
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);

    return {
      rawValue: code.data,
      boundingBox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  } catch (error) {
    console.error('QR code detection error:', error);
    return null;
  }
}
