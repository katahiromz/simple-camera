// ImageProcessingControls.tsx --- React component for image processing controls
import React, { useState, useEffect, useCallback } from 'react';
import { Settings, X, Sliders, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './ImageProcessingControls.css';
import {
  ImageProcessingParams,
  getDefaultImageProcessingParams,
  getFilterPresets,
  loadImageProcessingParams,
  saveImageProcessingParams,
} from './ImageProcessingUtils';

interface ImageProcessingControlsProps {
  params: ImageProcessingParams;
  onChange: (params: ImageProcessingParams) => void;
  disabled?: boolean;
}

/**
 * ImageProcessingControls component
 * Provides a comprehensive UI for adjusting image processing parameters
 * Supports both manual adjustments and preset filters
 */
const ImageProcessingControls: React.FC<ImageProcessingControlsProps> = ({
  params,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'adjust' | 'presets'>('adjust');
  const [localParams, setLocalParams] = useState<ImageProcessingParams>(params);

  // Sync local params with prop changes
  useEffect(() => {
    setLocalParams(params);
  }, [params]);

  // Handle parameter change with immediate update
  const handleParamChange = useCallback(
    (key: keyof ImageProcessingParams, value: number | boolean) => {
      const newParams = { ...localParams, [key]: value };
      setLocalParams(newParams);
      onChange(newParams);
      // Save to localStorage
      saveImageProcessingParams('AdvancedCamera_imageProcessing', newParams);
    },
    [localParams, onChange]
  );

  // Apply preset filter
  const applyPreset = useCallback(
    (presetParams: ImageProcessingParams) => {
      setLocalParams(presetParams);
      onChange(presetParams);
      saveImageProcessingParams('AdvancedCamera_imageProcessing', presetParams);
    },
    [onChange]
  );

  // Reset all parameters to defaults
  const handleReset = useCallback(() => {
    const defaults = getDefaultImageProcessingParams();
    setLocalParams(defaults);
    onChange(defaults);
    saveImageProcessingParams('AdvancedCamera_imageProcessing', defaults);
  }, [onChange]);

  // Toggle panel expansion
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const presets = getFilterPresets();

  // Check if current params match a preset using a simple equality check
  // Compare all numeric and boolean properties
  const isPresetMatch = (p1: ImageProcessingParams, p2: ImageProcessingParams): boolean => {
    return (
      p1.brightness === p2.brightness &&
      p1.contrast === p2.contrast &&
      p1.saturation === p2.saturation &&
      p1.hue === p2.hue &&
      p1.blur === p2.blur &&
      p1.sharpen === p2.sharpen &&
      p1.grayscale === p2.grayscale &&
      p1.sepia === p2.sepia &&
      p1.invert === p2.invert
    );
  };

  const activePreset = presets.find((preset) => isPresetMatch(preset.params, localParams));

  return (
    <>
      {/* Toggle button - always visible */}
      <button
        className="image-processing-controls__toggle"
        onClick={toggleExpanded}
        disabled={disabled}
        aria-label={isExpanded ? t('ip_close_controls') : t('ip_open_controls')}
        title={isExpanded ? t('ip_close_controls') : t('ip_open_controls')}
      >
        <Settings size={24} />
      </button>

      {/* Controls panel */}
      <div
        className={`image-processing-controls ${
          !isExpanded ? 'image-processing-controls--collapsed' : ''
        }`}
      >
        {/* Header */}
        <div className="image-processing-controls__header">
          <h3 className="image-processing-controls__title">
            {t('ip_title')}
          </h3>
          <button
            className="image-processing-controls__close"
            onClick={toggleExpanded}
            aria-label={t('ip_close')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="image-processing-controls__tabs">
          <button
            className={`image-processing-controls__tab ${
              activeTab === 'adjust' ? 'image-processing-controls__tab--active' : ''
            }`}
            onClick={() => setActiveTab('adjust')}
          >
            <Sliders size={16} style={{ display: 'inline', marginRight: '4px' }} />
            {t('ip_tab_adjust')}
          </button>
          <button
            className={`image-processing-controls__tab ${
              activeTab === 'presets' ? 'image-processing-controls__tab--active' : ''
            }`}
            onClick={() => setActiveTab('presets')}
          >
            <Palette size={16} style={{ display: 'inline', marginRight: '4px' }} />
            {t('ip_tab_presets')}
          </button>
        </div>

        {/* Adjust tab content */}
        {activeTab === 'adjust' && (
          <div className="image-processing-controls__group">
            {/* Brightness */}
            <div className="image-processing-controls__slider-group">
              <label className="image-processing-controls__label">
                <span>{t('ip_brightness')}</span>
                <span className="image-processing-controls__value">
                  {localParams.brightness > 0 ? '+' : ''}
                  {localParams.brightness}
                </span>
              </label>
              <input
                type="range"
                className="image-processing-controls__slider"
                min="-100"
                max="100"
                value={localParams.brightness}
                onChange={(e) =>
                  handleParamChange('brightness', parseInt(e.target.value))
                }
                disabled={disabled}
              />
            </div>

            {/* Contrast */}
            <div className="image-processing-controls__slider-group">
              <label className="image-processing-controls__label">
                <span>{t('ip_contrast')}</span>
                <span className="image-processing-controls__value">
                  {localParams.contrast > 0 ? '+' : ''}
                  {localParams.contrast}
                </span>
              </label>
              <input
                type="range"
                className="image-processing-controls__slider"
                min="-100"
                max="100"
                value={localParams.contrast}
                onChange={(e) =>
                  handleParamChange('contrast', parseInt(e.target.value))
                }
                disabled={disabled}
              />
            </div>

            {/* Saturation */}
            <div className="image-processing-controls__slider-group">
              <label className="image-processing-controls__label">
                <span>{t('ip_saturation')}</span>
                <span className="image-processing-controls__value">
                  {localParams.saturation > 0 ? '+' : ''}
                  {localParams.saturation}
                </span>
              </label>
              <input
                type="range"
                className="image-processing-controls__slider"
                min="-100"
                max="100"
                value={localParams.saturation}
                onChange={(e) =>
                  handleParamChange('saturation', parseInt(e.target.value))
                }
                disabled={disabled}
              />
            </div>

            {/* Hue */}
            <div className="image-processing-controls__slider-group">
              <label className="image-processing-controls__label">
                <span>{t('ip_hue')}</span>
                <span className="image-processing-controls__value">
                  {localParams.hue}°
                </span>
              </label>
              <input
                type="range"
                className="image-processing-controls__slider"
                min="0"
                max="360"
                value={localParams.hue}
                onChange={(e) =>
                  handleParamChange('hue', parseInt(e.target.value))
                }
                disabled={disabled}
              />
            </div>

            {/* Blur */}
            <div className="image-processing-controls__slider-group">
              <label className="image-processing-controls__label">
                <span>{t('ip_blur')}</span>
                <span className="image-processing-controls__value">
                  {localParams.blur}
                </span>
              </label>
              <input
                type="range"
                className="image-processing-controls__slider"
                min="0"
                max="10"
                step="0.5"
                value={localParams.blur}
                onChange={(e) =>
                  handleParamChange('blur', parseFloat(e.target.value))
                }
                disabled={disabled}
              />
            </div>

            {/* Effect checkboxes */}
            <div className="image-processing-controls__checkbox-group">
              <label className="image-processing-controls__checkbox-label">
                <input
                  type="checkbox"
                  className="image-processing-controls__checkbox"
                  checked={localParams.grayscale}
                  onChange={(e) =>
                    handleParamChange('grayscale', e.target.checked)
                  }
                  disabled={disabled}
                />
                {t('ip_grayscale')}
              </label>

              <label className="image-processing-controls__checkbox-label">
                <input
                  type="checkbox"
                  className="image-processing-controls__checkbox"
                  checked={localParams.sepia}
                  onChange={(e) => handleParamChange('sepia', e.target.checked)}
                  disabled={disabled}
                />
                {t('ip_sepia')}
              </label>

              <label className="image-processing-controls__checkbox-label">
                <input
                  type="checkbox"
                  className="image-processing-controls__checkbox"
                  checked={localParams.invert}
                  onChange={(e) =>
                    handleParamChange('invert', e.target.checked)
                  }
                  disabled={disabled}
                />
                {t('ip_invert')}
              </label>
            </div>
          </div>
        )}

        {/* Presets tab content */}
        {activeTab === 'presets' && (
          <div className="image-processing-controls__group">
            <div className="image-processing-controls__presets">
              {presets.map((preset, index) => (
                <button
                  key={index}
                  className={`image-processing-controls__preset ${
                    activePreset?.name === preset.name
                      ? 'image-processing-controls__preset--active'
                      : ''
                  }`}
                  onClick={() => applyPreset(preset.params)}
                  disabled={disabled}
                >
                  {t(preset.nameKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reset button */}
        <button
          className="image-processing-controls__reset"
          onClick={handleReset}
          disabled={disabled}
        >
          {t('ip_reset')}
        </button>
      </div>
    </>
  );
};

export default ImageProcessingControls;
