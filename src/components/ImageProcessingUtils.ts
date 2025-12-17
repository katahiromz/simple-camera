// ImageProcessingUtils.ts --- Image processing utility functions for camera component
// This module provides canvas-based image processing functions for real-time effects

/**
 * Image processing parameters interface
 * Defines all adjustable image processing settings
 * 
 * Note: The 'sharpen' parameter is reserved for future use with the applySharpen() function.
 * It is not applied by applyCSSFilters() as CSS filters do not support sharpening.
 */
export interface ImageProcessingParams {
  brightness: number;    // -100 to +100, default: 0
  contrast: number;      // -100 to +100, default: 0
  saturation: number;    // -100 to +100, default: 0
  hue: number;           // 0 to 360, default: 0
  blur: number;          // 0 to 10, default: 0
  sharpen: number;       // 0 to 1, default: 0 (reserved for applySharpen function)
  grayscale: boolean;    // true/false, default: false
  sepia: boolean;        // true/false, default: false
  invert: boolean;       // true/false, default: false
}

/**
 * Default image processing parameters
 * Returns a fresh set of default values
 */
export const getDefaultImageProcessingParams = (): ImageProcessingParams => ({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  blur: 0,
  sharpen: 0,
  grayscale: false,
  sepia: false,
  invert: false,
});

/**
 * Apply CSS filters to canvas context
 * Uses CSS filter syntax for real-time performance
 * 
 * @param ctx - Canvas 2D rendering context
 * @param params - Image processing parameters
 */
export const applyCSSFilters = (
  ctx: CanvasRenderingContext2D,
  params: ImageProcessingParams
): void => {
  const filters: string[] = [];

  // Brightness: -100 to +100 → CSS range 0 to 2
  if (params.brightness !== 0) {
    const brightnessValue = 1 + (params.brightness / 100);
    filters.push(`brightness(${brightnessValue})`);
  }

  // Contrast: -100 to +100 → CSS range 0 to 2
  if (params.contrast !== 0) {
    const contrastValue = 1 + (params.contrast / 100);
    filters.push(`contrast(${contrastValue})`);
  }

  // Saturation: -100 to +100 → CSS range 0 to 2
  if (params.saturation !== 0) {
    const saturationValue = 1 + (params.saturation / 100);
    filters.push(`saturate(${saturationValue})`);
  }

  // Hue rotation: 0 to 360 degrees
  if (params.hue !== 0) {
    filters.push(`hue-rotate(${params.hue}deg)`);
  }

  // Blur: 0 to 10 pixels
  if (params.blur > 0) {
    filters.push(`blur(${params.blur}px)`);
  }

  // Grayscale: 0 or 100%
  if (params.grayscale) {
    filters.push('grayscale(100%)');
  }

  // Sepia: 0 or 100%
  if (params.sepia) {
    filters.push('sepia(100%)');
  }

  // Invert: 0 or 100%
  if (params.invert) {
    filters.push('invert(100%)');
  }

  // Apply all filters or reset to none
  ctx.filter = filters.length > 0 ? filters.join(' ') : 'none';
};

/**
 * Apply sharpen effect using convolution matrix
 * More computationally expensive, should be used sparingly
 * 
 * @param imageData - ImageData to process
 * @param amount - Sharpen amount (0 to 1)
 * @returns Processed ImageData
 */
export const applySharpen = (
  imageData: ImageData,
  amount: number
): ImageData => {
  if (amount === 0) return imageData;

  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const output = new Uint8ClampedArray(data);

  // Sharpen kernel (3x3 convolution matrix)
  // Center weight adjusted by amount
  const weight = amount;
  const kernel = [
    0, -weight, 0,
    -weight, 1 + 4 * weight, -weight,
    0, -weight, 0
  ];

  // Apply convolution (skip edges for simplicity)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) { // RGB channels only
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            sum += data[idx] * kernel[kernelIdx];
          }
        }
        const outIdx = (y * width + x) * 4 + c;
        output[outIdx] = Math.max(0, Math.min(255, sum));
      }
    }
  }

  return new ImageData(output, width, height);
};

/**
 * Predefined filter presets
 * Each preset defines a complete set of image processing parameters
 */
export interface FilterPreset {
  name: string;
  nameKey: string; // i18n key
  params: ImageProcessingParams;
}

/**
 * Get all available filter presets
 * 
 * @returns Array of filter presets
 */
export const getFilterPresets = (): FilterPreset[] => [
  {
    name: 'None',
    nameKey: 'ip_preset_none',
    params: getDefaultImageProcessingParams(),
  },
  {
    name: 'Vivid',
    nameKey: 'ip_preset_vivid',
    params: {
      ...getDefaultImageProcessingParams(),
      brightness: 10,
      contrast: 20,
      saturation: 30,
    },
  },
  {
    name: 'Cool',
    nameKey: 'ip_preset_cool',
    params: {
      ...getDefaultImageProcessingParams(),
      hue: 200,
      saturation: 20,
      contrast: 10,
    },
  },
  {
    name: 'Warm',
    nameKey: 'ip_preset_warm',
    params: {
      ...getDefaultImageProcessingParams(),
      hue: 30,
      saturation: 20,
      brightness: 10,
    },
  },
  {
    name: 'Black & White',
    nameKey: 'ip_preset_bw',
    params: {
      ...getDefaultImageProcessingParams(),
      grayscale: true,
      contrast: 20,
    },
  },
  {
    name: 'Vintage',
    nameKey: 'ip_preset_vintage',
    params: {
      ...getDefaultImageProcessingParams(),
      sepia: true,
      brightness: -10,
      contrast: 15,
    },
  },
  {
    name: 'High Contrast',
    nameKey: 'ip_preset_high_contrast',
    params: {
      ...getDefaultImageProcessingParams(),
      contrast: 50,
      brightness: -5,
    },
  },
];

/**
 * Load image processing parameters from localStorage
 * 
 * @param key - Storage key
 * @returns Saved parameters or defaults
 */
export const loadImageProcessingParams = (key: string): ImageProcessingParams => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return { ...getDefaultImageProcessingParams(), ...JSON.parse(saved) };
    }
  } catch (error) {
    console.warn('Failed to load image processing params:', error);
  }
  return getDefaultImageProcessingParams();
};

/**
 * Save image processing parameters to localStorage
 * 
 * @param key - Storage key
 * @param params - Parameters to save
 */
export const saveImageProcessingParams = (key: string, params: ImageProcessingParams): void => {
  try {
    localStorage.setItem(key, JSON.stringify(params));
  } catch (error) {
    console.warn('Failed to save image processing params:', error);
  }
};
