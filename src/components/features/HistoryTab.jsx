import { useState, useEffect, useMemo } from 'react';
import { Download, Trash2, Clock, Search, X, AlertTriangle, ChevronDown, ChevronUp, Link2, User, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { filterHistory, debounce } from '@/utils/searchUtils';
import { getHistoryDisplayTitle, historyDownloadBasename } from '@/utils/history';
import { fetchYouTubeOEmbed } from '@/utils/youtubeMetadata';
import GlassCard from '@/components/layout/GlassCard';
import Button from '@/components/shared/Button';
import CopyButton from '@/components/shared/CopyButton';
import Input from '@/components/shared/Input';
import CeoBriefMarkdown from '@/components/shared/CeoBriefMarkdown';

const SERVICE_LABELS = {
  groq: '🚀 Groq',
  'whisper-local': '🤖 Whisper (local)',
  'whisper-modal': '☁️ Whisper (Modal)',
  captions: '📝 Captions',
  local: '🏠 Local server',
  aether: '☁️ Aether',
  huggingface: '🤗 Hugging Face',
  whisper: '🤖 Whisper',
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
  const [expandedBriefs, setExpandedBriefs] = useState(() => new Set());

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

  const toggleBrief = (timestamp) => {
    setExpandedBriefs((prev) => {
      const next = new Set(prev);
      if (next.has(timestamp)) next.delete(timestamp);
      else next.add(timestamp);
      return next;
    });
  };

  const requestCeoBrief = (timestamp) => {
    chrome.runtime.sendMessage(
      { type: 'generate_ceo_brief', timestamp },
      () => {
        void chrome.runtime.lastError;
      }
    );
  };

  const backfillYouTubeTitles = async (items) => {
    let changed = false;
    const updated = await Promise.all(items.map(async (item) => {
      if (item.title || !item.url) return item;
      const meta = await fetchYouTubeOEmbed(item.url);
      if (!meta?.title) return item;
      changed = true;
      return {
        ...item,
        title: meta.title,
        ...(meta.author && !item.author ? { author: meta.author } : {}),
      };
    }));
    if (changed) {
      chrome.storage.local.set({ history: updated });
    }
    return updated;
  };

  const loadHistory = () => {
    chrome.storage.local.get(['history'], async (result) => {
      const items = result.history || [];
      const enriched = await backfillYouTubeTitles(items);
      setHistory(enriched);
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

  const downloadTranscript = (item) => {
    const header = [
      item.title ? `Title: ${item.title}` : null,
      item.author ? `Author/Publisher: ${item.author}` : null,
      item.url ? `URL: ${item.url}` : null,
      item.fileName && !item.url ? `File: ${item.fileName}` : null,
      `Transcribed: ${formatDate(item.timestamp)}`,
      '',
      '---',
      '',
    ].filter(Boolean).join('\n');

    const blob = new Blob([header + item.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${historyDownloadBasename(item)}-${item.timestamp.slice(0, 10)}.txt`;
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
              placeholder="Search by title, author, URL, transcript, or brief..."
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
                      <div className="flex-1 min-w-0 space-y-2">
                        <h3 className="text-base font-semibold text-luna-white leading-snug">
                          {getHistoryDisplayTitle(item)}
                        </h3>

                        {item.author && (
                          <p className="flex items-center gap-1.5 text-sm text-luna-silver">
                            <User className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{item.author}</span>
                          </p>
                        )}

                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-luna-accent-primary hover:underline truncate"
                            title={item.url}
                          >
                            <Link2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{item.url}</span>
                          </a>
                        )}

                        {!item.url && item.fileName && (
                          <p className="text-xs text-luna-silver/70 truncate">
                            File: {item.fileName}
                          </p>
                        )}

                        {/* CEO Brief — secondary, collapsed under source link */}
                        <div className="rounded-lg border border-white/5 bg-black/10">
                          <button
                            type="button"
                            onClick={() => toggleBrief(item.timestamp)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                          >
                            <span className="flex items-center gap-1.5 text-xs font-medium text-luna-silver">
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              CEO Brief
                              {item.ceoBriefStatus === 'pending' && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-luna-accent-primary" />
                              )}
                              {item.ceoBriefStatus === 'ready' && (
                                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px]">
                                  Ready
                                </span>
                              )}
                              {item.ceoBriefStatus === 'error' && (
                                <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px]">
                                  Error
                                </span>
                              )}
                            </span>
                            {expandedBriefs.has(item.timestamp) ? (
                              <ChevronUp className="w-3.5 h-3.5 text-luna-silver shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-luna-silver shrink-0" />
                            )}
                          </button>

                          <AnimatePresence initial={false}>
                            {expandedBriefs.has(item.timestamp) && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
                                  {item.ceoBriefStatus === 'pending' && (
                                    <p className="text-xs text-luna-silver flex items-center gap-2">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      Generating CEO Brief from transcript…
                                    </p>
                                  )}

                                  {item.ceoBriefStatus === 'error' && (
                                    <div className="space-y-2">
                                      <p className="text-xs text-red-300">
                                        {item.ceoBriefError || 'Brief generation failed'}
                                      </p>
                                      <Button
                                        onClick={() => requestCeoBrief(item.timestamp)}
                                        variant="secondary"
                                        className="!px-3 !py-1 text-xs"
                                      >
                                        Retry
                                      </Button>
                                    </div>
                                  )}

                                  {item.ceoBrief && (
                                    <div className="space-y-2">
                                      <div className="bg-black/30 rounded-lg p-3 max-h-64 overflow-y-auto">
                                        <CeoBriefMarkdown markdown={item.ceoBrief} />
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <CopyButton text={item.ceoBrief} className="!px-3 !py-1 text-xs">
                                          Copy brief
                                        </CopyButton>
                                        <Button
                                          onClick={() => requestCeoBrief(item.timestamp)}
                                          variant="secondary"
                                          className="!px-3 !py-1 text-xs"
                                        >
                                          Regenerate
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {!item.ceoBrief && item.ceoBriefStatus !== 'pending' && item.ceoBriefStatus !== 'error' && (
                                    <div className="space-y-2">
                                      <p className="text-xs text-luna-silver">
                                        No brief yet. Generate from the raw transcript (transcript stays primary).
                                      </p>
                                      <Button
                                        onClick={() => requestCeoBrief(item.timestamp)}
                                        variant="secondary"
                                        className="!px-3 !py-1 text-xs"
                                      >
                                        Generate CEO Brief
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-luna-silver flex-wrap">
                          <Clock className="w-4 h-4 shrink-0" />
                          {formatDate(item.timestamp)}

                          {item.source && (
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              item.source === 'whisper' || item.source === 'whisper-local'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {SERVICE_LABELS[item.source] || item.source}
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
                        onClick={() => downloadTranscript(item)}
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
