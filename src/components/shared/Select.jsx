export default function Select({ value, onChange, options, className = '', disabled }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full px-4 py-3 bg-luna-shadow/50 backdrop-blur-md border border-luna-accent-primary/20
        rounded-lg text-luna-white cursor-pointer
        focus:border-luna-accent-primary focus:ring-2 focus:ring-luna-accent-primary/20
        outline-none transition-all appearance-none
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23E0E0FF' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        paddingRight: '40px'
      }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value} style={{ backgroundColor: '#1a1a2e', color: '#E0E0FF' }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
