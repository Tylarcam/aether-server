import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Mic, CircleDot, History, Settings } from 'lucide-react';
import { useUIReaction } from '@/hooks/useUIReaction';

const SPRING_CONFIG = {
  type: "spring",
  stiffness: 400,
  damping: 17
};

const tabs = [
  { id: 'transcribe', icon: Mic, label: 'Transcribe' },
  { id: 'record', icon: CircleDot, label: 'Record' },
  { id: 'history', icon: History, label: 'History' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export default function TabBar({ activeTab, setActiveTab, isRecording = false }) {
  const { controls: breatheControls, triggerMicro } = useUIReaction();

  // Trigger breathe animation when recording
  useEffect(() => {
    if (isRecording) {
      triggerMicro('tabBar', 'breathe');
    }
  }, [isRecording]);

  return (
    <motion.div
      animate={isRecording ? breatheControls : {}}
      className="glass-effect border-b border-white/10 px-3 py-2"
    >
      <div className="flex gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'text-luna-dark' : 'text-luna-silver hover:text-luna-white'
              }`}
              aria-label={tab.label}
            >
              {isActive && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 bg-gradient-to-br from-luna-accent-primary to-luna-accent-glow rounded-lg shadow-luna-glow"
                  transition={SPRING_CONFIG}
                />
              )}
              <Icon className="relative z-10 w-5 h-5 mx-auto" strokeWidth={1.5} />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
