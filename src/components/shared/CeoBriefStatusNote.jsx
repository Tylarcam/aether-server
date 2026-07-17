import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { findHistoryItemByTranscript } from '@/utils/history';

/**
 * Live CEO Brief status for a just-finished transcript (Transcribe/Record result panels).
 * Does not replace the raw transcript — points users to History for the full brief.
 */
export default function CeoBriefStatusNote({ transcript }) {
  const [item, setItem] = useState(null);

  useEffect(() => {
    if (!transcript?.trim()) {
      setItem(null);
      return;
    }

    const sync = (history) => {
      setItem(findHistoryItemByTranscript(history || [], transcript));
    };

    chrome.storage.local.get(['history'], (res) => sync(res.history));

    const listener = (changes, areaName) => {
      if (areaName !== 'local' || !changes.history) return;
      sync(changes.history.newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [transcript]);

  if (!transcript?.trim() || !item) return null;

  const status = item.ceoBriefStatus || 'idle';

  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-xs text-luna-silver">
      <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-0.5">
        {status === 'pending' && (
          <p className="flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-luna-accent-primary" />
            Generating CEO Brief… open History when ready.
          </p>
        )}
        {status === 'ready' && (
          <p>
            CEO Brief ready — open{' '}
            <span className="text-luna-white font-medium">History</span> and expand it under the source link.
          </p>
        )}
        {status === 'error' && (
          <p className="text-red-300">
            CEO Brief failed{item.ceoBriefError ? `: ${item.ceoBriefError}` : ''}. Retry from History.
          </p>
        )}
        {(status === 'idle' || !status) && (
          <p>CEO Brief will appear under the source link in History.</p>
        )}
      </div>
    </div>
  );
}
