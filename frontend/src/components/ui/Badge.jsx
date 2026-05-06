import clsx from 'clsx'

const variants = {
  default:    'bg-slate-100 text-slate-700',
  primary:    'bg-primary-100 text-primary-700',
  success:    'bg-green-100 text-green-700',
  warning:    'bg-yellow-100 text-yellow-700',
  danger:     'bg-red-100 text-red-700',
  processing: 'bg-blue-100 text-blue-700 animate-pulse',
}

export function Badge({ children, variant = 'default', className }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      variants[variant],
      className,
    )}>
      {children}
    </span>
  )
}
