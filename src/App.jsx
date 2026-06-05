import { useState, useEffect } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import TabBar from '@/components/layout/TabBar';
import GrainyMesh from '@/components/layout/GrainyMesh';
import TranscribeTab from '@/components/features/TranscribeTab';
import RecordTab from '@/components/features/RecordTab';
import HistoryTab from '@/components/features/HistoryTab';
import SettingsTab from '@/components/features/SettingsTab';
import PermissionOnboardingModal from '@/components/features/PermissionOnboardingModal';

function App() {
  const [activeTab, setActiveTab] = useState('record');
  const [isRecording, setIsRecording] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('aetherOnboarded', ({ aetherOnboarded }) => {
      if (!aetherOnboarded) setShowOnboarding(true);
    });
  }, []);

  const handleOnboardingClose = () => {
    chrome.storage.local.set({ aetherOnboarded: true });
    setShowOnboarding(false);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'transcribe':
        return <TranscribeTab />;
      case 'record':
        return <RecordTab isRecording={isRecording} setIsRecording={setIsRecording} />;
      case 'history':
        return <HistoryTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <RecordTab isRecording={isRecording} setIsRecording={setIsRecording} />;
    }
  };

  return (
    <ThemeProvider>
      <ToastProvider>
      <div className="min-h-screen w-full bg-luna-dark overflow-hidden relative">
        <GrainyMesh />
        <PermissionOnboardingModal open={showOnboarding} onClose={handleOnboardingClose} />

        <div className="relative z-10 flex flex-col h-screen max-w-2xl mx-auto">
          <TabBar activeTab={activeTab} setActiveTab={setActiveTab} isRecording={isRecording} />

          <div className="flex-1 overflow-y-auto p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
