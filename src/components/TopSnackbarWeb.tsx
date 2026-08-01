import React, { useEffect, useRef, useState, useCallback } from 'react';

interface TopSnackbarWebProps {
  message: string;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  onClose: () => void;
}

const SWIPE_DISTANCE_THRESHOLD = 60;
const SWIPE_DIRECTION_RATIO = 1.2;
const AUTO_DISMISS_MILLIS = 3000;
const DISMISS_ANIMATION_MILLIS = 250;

const TopSnackbarWeb: React.FC<TopSnackbarWebProps> = ({ message, actionLabel = null, onAction = null, onClose }) => {
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const [dismissing, setDismissing] = useState(false);

  const dismiss = useCallback(() => {
    setDismissing(true);
    window.setTimeout(onClose, DISMISS_ANIMATION_MILLIS);
  }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MILLIS);
    return () => window.clearTimeout(timer);
  }, [dismiss]);

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    const diffX = touch.clientX - startXRef.current;
    const diffY = touch.clientY - startYRef.current;
    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    if (absY >= SWIPE_DISTANCE_THRESHOLD && absY > absX * SWIPE_DIRECTION_RATIO && diffY < 0) {
      dismiss();
      return;
    }
    if (absX >= SWIPE_DISTANCE_THRESHOLD && absX > absY * SWIPE_DIRECTION_RATIO) {
      dismiss();
    }
  };

  return (
    <div
      className={`top-snackbar-web${dismissing ? ' top-snackbar-web--dismissing' : ''}`}
      role="status"
      aria-live="polite"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <span className="top-snackbar-web__message">{message}</span>
      <div className="top-snackbar-web__actions">
        {actionLabel && onAction ? (
          <button className="top-snackbar-web__button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
        <button className="top-snackbar-web__close" onClick={dismiss} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  );
};

export default TopSnackbarWeb;
