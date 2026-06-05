import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, ExternalLink, Trash2, Sun, Moon, Monitor, Mic, MicOff, Radio } from 'lucide-react';
import { useStorage } from '@/hooks/useStorage';
import { useTheme } from '@/hooks/useTheme';
import { useAudioDevices } from '@/hooks/useAudioDevices';
import GlassCard from '@/components/layout/GlassCard';
import Button from '@/components/shared/Button';
import Input from '@/components/shared/Input';
import Select from '@/components/shared/Select';
import StatusMessage from '@/components/shared/StatusMessage';

// Key baked in at build time from .env — available as a read-only fallback
const ENV_GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

export default function SettingsTab() {
  const [groqApiKey, setGroqApiKey] = useStorage('groq_api_key', '');
  const [tempGroqKey, setTempGroqKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [transcriptionService, setTranscriptionService] = useState('groq');
  const [whisperModel, setWhisperModel] = useState('tiny');
  const [modalWhisperUrl, setModalWhisperUrl] = useState('');
  const { theme, setTheme } = useTheme();
  const {
    devices,
    hasMicPermission,
    noInputDevice,
    permissionError,
    deviceId,
    setDeviceId,
    autoDetect,
    setAutoDetect,
    requestMicPermission,
    isTesting,
    micLevel,
    startMicTest,
    stopMicTest
  } = useAudioDevices();


  const handleSaveGroqKey = () => {
    if (tempGroqKey.trim()) {
      setGroqApiKey(tempGroqKey.trim());
      setSaveStatus('✅ Groq API key saved');
      setTempGroqKey('');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const handleClearGroqKey = () => {
    setGroqApiKey('');
    setTempGroqKey('');
    setSaveStatus('✅ Groq API key cleared (build-time key will be used)');
    setTimeout(() => setSaveStatus(''), 3000);
  };


  const handleClearHistory = () => {
    chrome.storage.local.set({ history: [] }, () => {
      setSaveStatus('✅ History cleared');
      setTimeout(() => setSaveStatus(''), 3000);
    });
  };

  const handleSaveTranscriptionSettings = () => {
    chrome.storage.sync.set({
      transcription_service: transcriptionService,
      whisper_model: whisperModel,
      modal_whisper_url: modalWhisperUrl
    }, () => {
      setSaveStatus('✅ Transcription settings saved successfully!');
      setTimeout(() => setSaveStatus(''), 4000);
    });
  };

  const [hasLoaded, setHasLoaded] = useState(false);

  // Mark as loaded after initial values are set
  useEffect(() => {
    chrome.storage.sync.get(['transcription_service', 'whisper_model', 'modal_whisper_url'], (res) => {
      setTranscriptionService(res.transcription_service || 'groq');
      setWhisperModel(res.whisper_model || 'tiny');
      setModalWhisperUrl(res.modal_whisper_url || '');
      setHasLoaded(true);
    });
  }, []);

  // Auto-save when settings change (after initial load)
  useEffect(() => {
    if (hasLoaded) {
      const timer = setTimeout(() => {
        chrome.storage.sync.set({
          transcription_service: transcriptionService,
          whisper_model: whisperModel,
          modal_whisper_url: modalWhisperUrl
        }, () => {
          // Silently save - no status message for auto-save
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [transcriptionService, whisperModel, modalWhisperUrl, hasLoaded]);

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-luna-white">Settings</h2>
          <p className="text-luna-silver">
            Configure your API keys and preferences
          </p>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-luna-white">Groq API Key</h3>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-luna-accent-primary hover:text-luna-accent-glow transition-colors flex items-center gap-1 text-sm"
            >
              Get Free Key
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <p className="text-sm text-luna-silver">
            Required for Groq Whisper transcription. Free tier: 28,800 audio sec/day. Overrides the built-in key.
          </p>

          <div className="relative">
            <Input
              type={showGroqKey ? 'text' : 'password'}
              value={tempGroqKey || groqApiKey}
              onChange={(e) => setTempGroqKey(e.target.value)}
              placeholder={
                groqApiKey
                  ? 'Key saved — enter new key to replace'
                  : ENV_GROQ_KEY
                    ? 'Configured via .env — enter to override'
                    : 'Enter your Groq API key (gsk_...)'
              }
            />
            <button
              onClick={() => setShowGroqKey(!showGroqKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-luna-silver hover:text-luna-white transition-colors"
            >
              {showGroqKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleSaveGroqKey}
              disabled={!tempGroqKey.trim()}
              variant="primary"
              className="flex-1"
            >
              <div className="flex items-center justify-center gap-2">
                <Save className="w-5 h-5" />
                Save Key
              </div>
            </Button>
            <Button
              onClick={handleClearGroqKey}
              disabled={!groqApiKey}
              variant="secondary"
              className="flex-1"
            >
              <div className="flex items-center justify-center gap-2">
                <Trash2 className="w-5 h-5" />
                Clear
              </div>
            </Button>
          </div>

          {(groqApiKey || ENV_GROQ_KEY) && !tempGroqKey && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <p className="text-sm text-green-400 text-center">
                ✓ Groq API key is configured{!groqApiKey && ENV_GROQ_KEY ? ' via .env' : ''}
              </p>
            </div>
          )}
          {!groqApiKey && !ENV_GROQ_KEY && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-400 text-center">
                ⚠️ No Groq key found. Add one above or set VITE_GROQ_API_KEY in .env.
              </p>
            </div>
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-luna-white">Transcription Service</h3>
            <span className="text-xs text-luna-accent-primary bg-luna-accent-primary/10 px-2 py-1 rounded">
              Auto-saves
            </span>
          </div>
          <p className="text-sm text-luna-silver">
            Choose your preferred transcription service. Whisper is free and runs locally. Settings are saved automatically.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-luna-white mb-2">
                Service Preference
              </label>
              <Select
                value={transcriptionService}
                onChange={(value) => setTranscriptionService(value)}
                options={[
                  { value: 'groq', label: 'Groq Whisper (Free, cloud, fastest)' },
                  { value: 'whisper-modal', label: 'Whisper (Modal, cloud)' },
                  { value: 'whisper', label: 'Whisper (Local, requires server)' },
                ]}
              />
              <p className="text-xs text-luna-silver mt-2">
                {transcriptionService === 'groq'
                  ? 'Uses Groq Whisper API. Free tier: 28,800 audio sec/day. API key configured in build.'
                  : transcriptionService === 'whisper-modal'
                    ? 'Uses Whisper on Modal cloud. Requires deployed endpoint URL below.'
                    : 'Uses local Whisper. Requires server running (npm run server).'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-luna-white mb-2">
                Whisper Model
              </label>
              <Select
                value={whisperModel}
                onChange={(value) => setWhisperModel(value)}
                disabled={transcriptionService === 'groq'}
                options={[
                  { value: 'tiny', label: 'Tiny - Fastest (~39M params)' },
                  { value: 'base', label: 'Base - Good balance (~74M params)' },
                  { value: 'small', label: 'Small - Better accuracy (~244M params)' },
                  { value: 'medium', label: 'Medium - High accuracy (~769M params)' },
                  { value: 'large-v3', label: 'Large v3 - Best accuracy (Modal only)' },
                ]}
              />
              {transcriptionService === 'groq' && (
                <p className="text-xs text-yellow-400 mt-2">
                  Model selection only applies to Whisper (Local) and Whisper (Modal).
                </p>
              )}
              {transcriptionService === 'groq' && (
                <p className="text-xs text-green-400 mt-2">
                  Groq always uses whisper-large-v3-turbo — best quality at maximum speed.
                </p>
              )}
              {transcriptionService === 'whisper' && (
                <p className="text-xs text-luna-silver mt-2">
                  Requires the local server running (npm run server) and Python whisper installed.
                </p>
              )}
              {transcriptionService === 'whisper-modal' && (
                <p className="text-xs text-luna-silver mt-2">
                  Uses your deployed Modal endpoint URL below.
                </p>
              )}
            </div>

            {transcriptionService === 'whisper-modal' && (
              <div>
                <label className="block text-sm font-medium text-luna-white mb-2">
                  Modal Whisper Endpoint URL
                </label>
                <Input
                  value={modalWhisperUrl}
                  onChange={(e) => setModalWhisperUrl(e.target.value)}
                  placeholder="https://<your-modal-endpoint>"
                />
                <p className="text-xs text-luna-silver mt-2">
                  Paste the base endpoint URL from Modal (e.g. the URL that serves <code className="text-luna-white">/health</code> and <code className="text-luna-white">/transcribe</code>).
                </p>
              </div>
            )}

            <div className="bg-luna-accent-primary/10 border border-luna-accent-primary/20 rounded-lg p-3">
              <p className="text-xs text-luna-white">
                <strong>Current Settings:</strong>
              </p>
              <p className="text-xs text-luna-silver mt-1">
                Service: <span className="text-luna-accent-primary">
                  {transcriptionService === 'groq'
                    ? 'Groq Whisper'
                    : transcriptionService === 'whisper-modal'
                      ? 'Whisper (Modal)'
                      : 'Whisper (Local)'}
                </span>
                {(transcriptionService === 'whisper' || transcriptionService === 'whisper-modal') && (
                  <> • Model: <span className="text-luna-accent-primary">{whisperModel}</span></>
                )}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-luna-white">Audio Input Device</h3>
            <span className="text-xs text-luna-accent-primary bg-luna-accent-primary/10 px-2 py-1 rounded">
              Auto-saves
            </span>
          </div>
          <p className="text-sm text-luna-silver">
            Select which microphone to use for testing. Tab audio capture uses system defaults.
          </p>

          {/* Auto-detect / Manual toggle */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => setAutoDetect(true)}
              variant={autoDetect ? 'primary' : 'secondary'}
            >
              <div className="flex items-center justify-center gap-2">
                <Radio className="w-4 h-4" />
                Auto-detect
              </div>
            </Button>
            <Button
              onClick={() => setAutoDetect(false)}
              variant={!autoDetect ? 'primary' : 'secondary'}
            >
              <div className="flex items-center justify-center gap-2">
                <Mic className="w-4 h-4" />
                Manual
              </div>
            </Button>
          </div>

          {/* Case 1: No mic hardware — inform user, device-change still works */}
          {!autoDetect && noInputDevice && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <p className="text-sm text-luna-silver">
                No microphone detected. Headphone device-change monitoring is active automatically.
              </p>
            </div>
          )}

          {/* Case 2: Has hardware but no permission yet */}
          {!autoDetect && !hasMicPermission && !noInputDevice && (
            <Button
              onClick={requestMicPermission}
              variant="secondary"
              className="w-full"
            >
              <div className="flex items-center justify-center gap-2">
                <Mic className="w-4 h-4" />
                Grant Mic Access
              </div>
            </Button>
          )}

          {/* Case 3: Permission granted — show device dropdown */}
          {!autoDetect && hasMicPermission && (
            <div>
              <label className="block text-sm font-medium text-luna-white mb-2">
                Input Device
              </label>
              <Select
                value={deviceId}
                onChange={(value) => setDeviceId(value)}
                options={[
                  { value: 'default', label: 'Default Device' },
                  ...devices.map((d) => ({
                    value: d.deviceId,
                    label: d.label || `Device ${d.deviceId.slice(0, 8)}`
                  }))
                ]}
              />
            </div>
          )}

          {/* Permission error — only genuine denial (not NotFoundError) */}
          {permissionError && (
            <p className="text-xs text-red-400">{permissionError}</p>
          )}

          {/* Test Microphone — hidden when no input device */}
          {!noInputDevice && (
            <Button
              onClick={() => isTesting ? stopMicTest() : startMicTest(deviceId)}
              disabled={!hasMicPermission}
              variant={isTesting ? 'primary' : 'secondary'}
              className="w-full"
            >
              <div className="flex items-center justify-center gap-2">
                {isTesting ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isTesting ? 'Stop Test' : 'Test Microphone'}
              </div>
            </Button>
          )}

          {/* Level meter */}
          {isTesting && (
            <div className="space-y-1">
              <p className="text-xs text-luna-silver">Mic level</p>
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-75"
                  style={{
                    width: `${micLevel * 100}%`,
                    background: 'linear-gradient(to right, var(--luna-accent-primary, #7c3aed), var(--luna-accent-glow, #a78bfa))'
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-luna-white">Theme</h3>
            <span className="text-xs text-luna-accent-primary bg-luna-accent-primary/10 px-2 py-1 rounded">
              Auto-saves
            </span>
          </div>
          <p className="text-sm text-luna-silver">
            Choose your preferred theme. System theme follows your OS preference.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => setTheme('light')}
              variant={theme === 'light' ? 'primary' : 'secondary'}
              className="flex flex-col items-center gap-2 py-4"
            >
              <Sun className="w-5 h-5" />
              <span className="text-xs">Light</span>
            </Button>
            <Button
              onClick={() => setTheme('dark')}
              variant={theme === 'dark' ? 'primary' : 'secondary'}
              className="flex flex-col items-center gap-2 py-4"
            >
              <Moon className="w-5 h-5" />
              <span className="text-xs">Dark</span>
            </Button>
            <Button
              onClick={() => setTheme('system')}
              variant={theme === 'system' ? 'primary' : 'secondary'}
              className="flex flex-col items-center gap-2 py-4"
            >
              <Monitor className="w-5 h-5" />
              <span className="text-xs">System</span>
            </Button>
          </div>
          <div className="bg-luna-accent-primary/10 border border-luna-accent-primary/20 rounded-lg p-3">
            <p className="text-xs text-luna-white">
              <strong>Current Theme:</strong>
            </p>
            <p className="text-xs text-luna-silver mt-1">
              {theme === 'system' ? 'System (follows OS preference)' : theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-luna-white">Data Management</h3>
          <Button
            onClick={handleClearHistory}
            variant="secondary"
            className="w-full"
          >
            <div className="flex items-center justify-center gap-2">
              <Trash2 className="w-5 h-5" />
              Clear Transcription History
            </div>
          </Button>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-luna-white">About</h3>
          <div className="space-y-2 text-luna-silver text-sm">
            <p>
              <strong className="text-luna-white">Version:</strong> 2.0.0
            </p>
            <p>
              <strong className="text-luna-white">Description:</strong> Audio transcription Chrome extension powered by Groq Whisper
            </p>
            <p className="text-xs text-luna-silver/70 mt-4">
              Your API key is stored locally in Chrome sync storage and is never sent to our servers.
              It's only used to communicate directly with the transcription API.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
