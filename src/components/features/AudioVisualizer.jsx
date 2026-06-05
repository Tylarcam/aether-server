import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

// Accepts analyserDataRef — a React ref whose .current is a Uint8Array of
// frequency data updated at ~20fps by the offscreen recording document.
export default function AudioVisualizer({ analyserDataRef }) {
  const canvasRef = useRef(null);
  const animationIdRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      const data = analyserDataRef?.current;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(15, 15, 30, 0.3)');
      gradient.addColorStop(1, 'rgba(15, 15, 30, 0.1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      if (data && data.length > 0) {
        const barWidth = (width / data.length) * 2.5;
        let x = 0;

        for (let i = 0; i < data.length; i++) {
          const barHeight = (data[i] / 255) * height * 0.8;

          const barGradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
          barGradient.addColorStop(0, 'rgba(224, 224, 255, 0.9)');
          barGradient.addColorStop(0.5, 'rgba(204, 204, 255, 0.7)');
          barGradient.addColorStop(1, 'rgba(180, 180, 255, 0.5)');

          ctx.fillStyle = barGradient;
          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      }

      animationIdRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    };
  }, [analyserDataRef]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-luna-white">Audio Levels</h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-luna-silver">Recording</span>
        </div>
      </div>
      <div className="relative rounded-lg overflow-hidden bg-gradient-to-b from-luna-dark/50 to-black/50 border border-white/10">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-auto"
        />
      </div>
      <p className="text-xs text-luna-silver text-center">
        Visual representation of audio frequency data
      </p>
    </motion.div>
  );
}
