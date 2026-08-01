import React, { useEffect, useRef } from 'react';

interface TopSnackbarWebProps {
  message: string;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  onClose: () => void;
}

const SWIPE_DISTANCE_THRESHOLD = 60;
const SWIPE_DIRECTION_RATIO = 1.2;
const AUTO_DISMISS_MILLIS = 3000;

const TopSnackbarWeb: React.FC<TopSnackbarWebProps> = ({ message, actionLabel = null, onAction = null, onClose }) => {
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(onClose, AUTO_DISMISS_MILLIS);
    return () => window.clearTimeout(timer);
  }, [onClose]);

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
      onClose();
      return;
    }
    if (absX >= SWIPE_DISTANCE_THRESHOLD && absX > absY * SWIPE_DIRECTION_RATIO) {
      onClose();
    }
  };

  return (
    <div
      className="top-snackbar-web"
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
        <button className="top-snackbar-web__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  );
};

export default TopSnackbarWeb;
