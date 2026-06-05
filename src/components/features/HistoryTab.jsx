import { useState, useEffect, useMemo } from 'react';
import { Download, Trash2, Clock, Search, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { filterHistory, debounce } from '@/utils/searchUtils';
import GlassCard from '@/components/layout/GlassCard';
import Button from '@/components/shared/Button';
import CopyButton from '@/components/shared/CopyButton';
import Input from '@/components/shared/Input';

const SERVICE_LABELS = {
  groq: '🚀 Groq',
  'whisper-local': '🤖 Whisper (local)',
  'whisper-modal': '☁️ Whisper (Modal)',
};

const STAGE_LABELS = {
  extracting: 'Audio extraction',
  uploading: 'File upload',
  submitting: 'Submission',
  polling: 'Polling',
  processing: 'Processing',
  validating: 'Validation',
};

export default function HistoryTab() {
  const [history, setHistory] = useState([]);
  const [errorLog, setErrorLog] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    loadHistory();
    loadErrorLog();

    const listener = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.history) setHistory(changes.history.newValue || []);
      if (changes.error_log) setErrorLog(changes.error_log.newValue || []);
    };
    chrome.storage.onChanged.addListener(listener);

    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const loadHistory = () => {
    chrome.storage.local.get(['history'], (result) => {
      setHistory(result.history || []);
    });
  };

  const loadErrorLog = () => {
    chrome.storage.local.get(['error_log'], (result) => {
      setErrorLog(result.error_log || []);
    });
  };

  const clearErrorLog = () => {
    chrome.storage.local.set({ error_log: [] });
    setErrorLog([]);
  };

  const deleteErrorEntry = (id) => {
    const updated = errorLog.filter(e => e.id !== id);
    chrome.storage.local.set({ error_log: updated });
    setErrorLog(updated);
  };

  const downloadTranscript = (text, timestamp) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteItem = (index) => {
    const newHistory = history.filter((_, i) => i !== index);
    chrome.storage.local.set({ history: newHistory });
    setHistory(newHistory);
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  // Filter history based on search query
  const filteredHistory = useMemo(() => {
    return filterHistory(history, searchQuery);
  }, [history, searchQuery]);

  const clearSearch = () => {
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-luna-white">Transcription History</h2>
          <p className="text-luna-silver">
            View and manage your past transcriptions
          </p>
        </div>
      </GlassCard>

      {history.length > 0 && (
        <GlassCard>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-luna-silver" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcriptions, files, URLs..."
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-luna-silver hover:text-luna-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-sm text-luna-silver mt-2">
              Found {filteredHistory.length} result{filteredHistory.length !== 1 ? 's' : ''}
            </p>
          )}
        </GlassCard>
      )}

      {history.length === 0 ? (
        <GlassCard>
          <div className="text-center py-12">
            <Clock className="w-16 h-16 text-luna-silver/50 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-luna-white mb-2">No History Yet</h3>
            <p className="text-luna-silver">
              Your transcription history will appear here
            </p>
          </div>
        </GlassCard>
      ) : filteredHistory.length === 0 && searchQuery ? (
        <GlassCard>
          <div className="text-center py-12">
            <Search className="w-16 h-16 text-luna-silver/50 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-luna-white mb-2">No Results Found</h3>
            <p className="text-luna-silver">
              No transcriptions match your search query "{searchQuery}"
            </p>
            <Button
              onClick={clearSearch}
              variant="secondary"
              className="mt-4"
            >
              Clear Search
            </Button>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredHistory.map((item, index) => {
              // Find original index for delete operation
              const originalIndex = history.findIndex(h => h.timestamp === item.timestamp);
              return (
              <motion.div
                key={item.timestamp}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.2 }}
              >
                <GlassCard>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm text-luna-silver mb-2">
                          <Clock className="w-4 h-4" />
                          {formatDate(item.timestamp)}

                          {item.source && (
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              item.source === 'whisper'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {SERVICE_LABELS[item.source] || item.source}
                            </span>
                          )}

                          {item.fileName && (
                            <span className="text-xs text-luna-silver/70">
                              ({item.fileName})
                            </span>
                          )}
                        </div>
                        <div className="bg-black/20 rounded-lg p-4 max-h-40 overflow-y-auto">
                          <p className="text-luna-white text-sm line-clamp-6">
                            {item.text}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <CopyButton text={item.text} className="!px-4 !py-2">
                        Copy
                      </CopyButton>
                      <Button
                        onClick={() => downloadTranscript(item.text, item.timestamp)}
                        variant="secondary"
                        className="!px-4 !py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Download className="w-4 h-4" />
                          Download
                        </div>
                      </Button>
                      <Button
                        onClick={() => deleteItem(originalIndex)}
                        variant="secondary"
                        className="!px-4 !py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </div>
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Error Log */}
      <GlassCard>
        <button
          onClick={() => setShowErrors(v => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="font-semibold text-luna-white">Error Log</span>
            {errorLog.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">
                {errorLog.length}
              </span>
            )}
          </div>
          {showErrors ? (
            <ChevronUp className="w-4 h-4 text-luna-silver" />
          ) : (
            <ChevronDown className="w-4 h-4 text-luna-silver" />
          )}
        </button>

        <AnimatePresence>
          {showErrors && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-3">
                {errorLog.length === 0 ? (
                  <p className="text-center text-luna-silver text-sm py-4">No errors logged.</p>
                ) : (
                  <>
                    <div className="flex justify-end">
                      <Button onClick={clearErrorLog} variant="secondary" className="!px-3 !py-1 text-xs">
                        Clear all
                      </Button>
                    </div>
                    {errorLog.map((entry) => (
                      <div key={entry.id} className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs text-luna-silver mb-1 flex-wrap">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{formatDate(entry.timestamp)}</span>
                              {entry.service && (
                                <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">
                                  {SERVICE_LABELS[entry.service] || entry.service}
                                </span>
                              )}
                              {entry.stage && (
                                <span className="text-luna-silver/60">
                                  at {STAGE_LABELS[entry.stage] || entry.stage}
                                </span>
                              )}
                            </div>
                            {entry.sourceRef && (
                              <p className="text-xs text-luna-silver/70 truncate mb-1">
                                {entry.source === 'url' ? '🔗' : '📄'} {entry.sourceRef}
                              </p>
                            )}
                            <p className="text-sm text-red-300 whitespace-pre-wrap break-words">
                              {entry.errorMessage}
                            </p>
                          </div>
                          <button
                            onClick={() => deleteErrorEntry(entry.id)}
                            className="text-luna-silver/40 hover:text-luna-silver shrink-0 mt-0.5"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </div>
  );
}
