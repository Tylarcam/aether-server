import { motion } from 'framer-motion';

const SPRING_CONFIG = {
  type: "spring",
  stiffness: 400,
  damping: 17
};

export default function Button({ children, onClick, variant = 'primary', disabled = false, className = '' }) {
  const baseClasses = "px-6 py-3 rounded-full font-semibold transition-all outline-none relative overflow-hidden";
  const variantClasses = variant === 'primary'
    ? "bg-gradient-to-br from-luna-accent-primary to-luna-accent-glow text-luna-dark shadow-luna-glow"
    : "bg-white/10 backdrop-blur-md border border-white/20 text-luna-white shadow-luna-sm";

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.05, boxShadow: disabled ? undefined : "0 0 30px rgba(224, 224, 255, 0.4)" }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      transition={SPRING_CONFIG}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {children}
    </motion.button>
  );
}
