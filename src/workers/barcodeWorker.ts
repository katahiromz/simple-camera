// barcodeWorker.ts --- Web Worker for QR code detection using BarcodeDetector and OffscreenCanvas

// Message types
interface DetectionResult {
  type: 'result';
  rawValue: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  format: string;
}

interface NoSupportMessage {
  type: 'no-support';
}

type WorkerResponse = DetectionResult | NoSupportMessage;

// Check if BarcodeDetector is available
const isBarcodeDetectorSupported = 'BarcodeDetector' in self;

// Initialize BarcodeDetector if supported
let barcodeDetector: BarcodeDetector | null = null;

if (isBarcodeDetectorSupported) {
  try {
    barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
    console.log('[BarcodeWorker] BarcodeDetector initialized with qr_code format');
  } catch (error) {
    console.error('[BarcodeWorker] Failed to initialize BarcodeDetector:', error);
  }
} else {
  console.warn('[BarcodeWorker] BarcodeDetector is not supported in this browser');
  // Send no-support message immediately
  self.postMessage({ type: 'no-support' } as NoSupportMessage);
}

// Handle messages from main thread
self.addEventListener('message', async (event: MessageEvent) => {
  const { data } = event;

  // Check if we have a valid bitmap
  if (data instanceof ImageBitmap) {
    // Process the ImageBitmap for QR code detection
    if (!barcodeDetector) {
      // BarcodeDetector not available
      return;
    }

    try {
      // Detect barcodes directly from ImageBitmap
      const detectedCodes = await barcodeDetector.detect(data);

      // If we found at least one QR code, return the first one
      if (detectedCodes && detectedCodes.length > 0) {
        const code = detectedCodes[0];
        const bbox = code.boundingBox;

        const result: DetectionResult = {
          type: 'result',
          rawValue: code.rawValue,
          boundingBox: {
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
          },
          format: code.format,
        };

        self.postMessage(result);
      }
      // If no codes detected, we don't send anything back
    } catch (error) {
      console.error('[BarcodeWorker] Detection error:', error);
    } finally {
      // Close the ImageBitmap to free memory
      data.close();
    }
  }
});

// Export empty object to make this a module
export {};
