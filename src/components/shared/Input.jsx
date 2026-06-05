export default function Input({ placeholder, value, onChange, type = 'text', className = '', disabled, accept }) {
  // File inputs are uncontrolled and don't use value prop
  const isFileInput = type === 'file';
  const inputProps = {
    type,
    placeholder,
    onChange,
    disabled,
    accept,
    className: `w-full px-4 py-3 bg-luna-shadow/50 backdrop-blur-md border border-luna-accent-primary/20
      rounded-lg text-luna-white placeholder-luna-slate
      focus:border-luna-accent-primary focus:ring-2 focus:ring-luna-accent-primary/20
      outline-none transition-all ${className}`
  };

  // Only add value prop for non-file inputs
  if (!isFileInput && value !== undefined) {
    inputProps.value = value;
  }

  return <input {...inputProps} />;
}
