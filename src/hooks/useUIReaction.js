import { useAnimationControls } from 'framer-motion';

// Animation variants for microinteractions
const MICRO_VARIANTS = {
  pulse: {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.1, 1],
      transition: {
        duration: 0.4,
        ease: "easeInOut"
      }
    }
  },
  breathe: {
    initial: { scale: 1, opacity: 0.9 },
    animate: {
      scale: [1, 1.02, 1],
      opacity: [0.9, 1, 0.9],
      transition: {
        duration: 2,
        ease: "easeInOut",
        repeat: Infinity
      }
    },
    exit: {
      scale: 1,
      opacity: 0.9,
      transition: {
        duration: 0.3
      }
    }
  },
  flip: {
    initial: { rotateY: 0 },
    animate: {
      rotateY: [0, 180, 360],
      transition: {
        duration: 0.6,
        ease: "easeInOut"
      }
    }
  }
};

export function useUIReaction() {
  const controls = useAnimationControls();

  const triggerMicro = async (event, type) => {
    if (!MICRO_VARIANTS[type]) {
      console.warn(`Unknown microinteraction type: ${type}`);
      return;
    }

    const variant = MICRO_VARIANTS[type];

    try {
      await controls.start(variant.animate);
      if (variant.exit) {
        await controls.start(variant.exit);
      } else {
        await controls.start(variant.initial);
      }
    } catch (err) {
      // Animation was interrupted, which is fine
    }
  };

  return {
    controls,
    triggerMicro,
    variants: MICRO_VARIANTS
  };
}
