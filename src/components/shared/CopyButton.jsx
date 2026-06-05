import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import Button from './Button';

export default function CopyButton({ text, children, className = '', variant = 'secondary' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button onClick={handleCopy} variant={variant} className={className}>
      <div className="flex items-center gap-2">
        {copied
          ? <Check className="w-4 h-4 text-green-400" />
          : <Copy className="w-4 h-4" />
        }
        {children && (
          <span className={copied ? 'text-green-400' : undefined}>{copied ? 'Copied!' : children}</span>
        )}
      </div>
    </Button>
  );
}
