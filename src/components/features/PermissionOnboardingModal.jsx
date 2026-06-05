import { motion, AnimatePresence } from 'framer-motion';
import { Pin, MousePointerClick, Mic, X } from 'lucide-react';
import Button from '@/components/shared/Button';

const STEPS = [
  {
    icon: Pin,
    number: '1',
    title: 'Pin Aether to your toolbar',
    description: 'Click the puzzle-piece icon in Chrome\'s top-right corner, find Aether, and click the pin icon. This makes it one click away.',
  },
  {
    icon: MousePointerClick,
    number: '2',
    title: 'Navigate to the tab you want to record',
    description: 'Go to YouTube, a podcast, a course video — any tab with audio you\'d like to capture.',
  },
  {
    icon: Mic,
    number: '3',
    title: 'Click the Aether icon on that tab, then Record',
    description: 'Clicking the icon while on that tab grants Aether capture permission for it. You only need to do this once per browser session.',
  },
];

export default function PermissionOnboardingModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="glass-effect rounded-2xl p-6 w-full max-w-sm relative"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-luna-silver hover:text-luna-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <h2 className="text-xl font-bold text-luna-white mb-1">One-time setup</h2>
              <p className="text-sm text-luna-silver">
                Chrome requires the extension to be active on the tab you want to record. Takes 10 seconds.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              {STEPS.map(({ icon: Icon, number, title, description }) => (
                <div key={number} className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-luna-accent-primary/20 border border-luna-accent-primary/40 flex items-center justify-center">
                    <span className="text-xs font-bold text-luna-accent-primary">{number}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className="w-4 h-4 text-luna-accent-primary flex-shrink-0" />
                      <p className="text-sm font-semibold text-luna-white">{title}</p>
                    </div>
                    <p className="text-xs text-luna-silver leading-relaxed">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={onClose} variant="primary" className="w-full justify-center">
              Got it, let&apos;s go!
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
