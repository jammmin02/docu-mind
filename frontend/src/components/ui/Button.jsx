import clsx from 'clsx'
import { Spinner } from './Spinner'

const variants = {
  primary:  'bg-primary-600 hover:bg-primary-700 text-white shadow-sm',
  secondary:'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm',
  danger:   'bg-red-500 hover:bg-red-600 text-white shadow-sm',
  ghost:    'hover:bg-slate-100 text-slate-700',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export function Button({
  children, variant = 'primary', size = 'md',
  loading, disabled, className, ...props
}) {
  return (
    <button
      {...props}
      disabled={loading || disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className,
      )}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
