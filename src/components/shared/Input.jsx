export default function Input({ placeholder, value, onChange, type = 'text', className = '', disabled, accept }) {
  // File inputs are uncontrolled and don't use value prop
  const isFileInput = type === 'file';
  const inputProps = {
    type,
    placeholder,
    onChange,
    disabled,
    accept,
    className: `luna-field w-full px-4 py-3 backdrop-blur-md rounded-lg outline-none transition-all ${className}`
  };

  // Only add value prop for non-file inputs
  if (!isFileInput && value !== undefined) {
    inputProps.value = value;
  }

  return <input {...inputProps} />;
}
