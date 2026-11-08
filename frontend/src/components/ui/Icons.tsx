type IconProps = {
  className?: string
}

function base(className?: string) {
  return {
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    className: className ?? 'size-4',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  )
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </svg>
  )
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg {...base(className)} fill="currentColor" stroke="none">
      <path d="M12 3.6l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.6Z" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  )
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16.2v.1" />
    </svg>
  )
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.4a5.5 5.5 0 0 1 3 5.1" />
    </svg>
  )
}

export function BallIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5 15.9 10.4 14.4 14.9h-4.8L8.1 10.4 12 7.5Z" />
      <path d="M12 3v4.5M4.3 9.4l3.8 1M19.7 9.4l-3.8 1M7.4 19l2.2-4.1M16.6 19l-2.2-4.1M12 21v-6" />
    </svg>
  )
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </svg>
  )
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </svg>
  )
}

export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`animate-spin ${className ?? 'size-4'}`}
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MailIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  )
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
    </svg>
  )
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M2.8 12S6.4 5.8 12 5.8 21.2 12 21.2 12 17.6 18.2 12 18.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  )
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 4l16 16" />
      <path d="M9.6 6.2A9.6 9.6 0 0 1 12 5.8c5.6 0 9.2 6.2 9.2 6.2a17 17 0 0 1-2.6 3.3M6.6 7.9A16.7 16.7 0 0 0 2.8 12S6.4 18.2 12 18.2a9.3 9.3 0 0 0 3.5-.7" />
      <path d="M10.2 10.4a2.8 2.8 0 0 0 3.7 3.8" />
    </svg>
  )
}

export function SparkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9L12 3.5Z" />
      <path d="M18 16.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" />
    </svg>
  )
}
