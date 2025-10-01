export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
  min,
  max,
  step,
  className = '',
}: {
  label?: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  min?: string | number
  max?: string | number
  step?: string | number
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs uppercase tracking-wider text-dark font-medium">
          {label}
          {required && ' (REQUIRED)'}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
        className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark font-sans"
      />
    </div>
  )
}
