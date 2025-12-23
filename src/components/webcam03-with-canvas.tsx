import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam03 from './webcam03';

const Webcam03WithCanvas = () => {
  const webcamRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const render = () => {
      if (webcamRef.current?.video && canvasRef.current) {
        const video = webcamRef.current.video;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }

        // 丸を描画
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(canvas.width / 4, canvas.height / 3, 80, 0, Math.PI * 2);
        ctx.stroke();
        
        // 四角を描画
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.lineWidth = 5;
        ctx.strokeRect(canvas.width / 2, canvas.height / 2, 150, 150);
      }
      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      <div>
        <h3>元の映像</h3>
        <Webcam03 ref={webcamRef} style={{ width: '320px' }} />
      </div>
      <div>
        <h3>キャンバス出力</h3>
        <canvas ref={canvasRef} style={{ width: '320px' }} />
      </div>
    </div>
  );
};

export default Webcam03WithCanvas;
