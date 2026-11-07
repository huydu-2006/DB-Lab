export default function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-strong text-white shadow-sm shadow-brand-strong/30">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5 15.9 10.4 14.4 14.9h-4.8L8.1 10.4 12 7.5Z" />
          <path d="M12 3v4.5M4.3 9.4l3.8 1M19.7 9.4l-3.8 1M7.4 19l2.2-4.1M16.6 19l-2.2-4.1M12 21v-6" />
        </svg>
      </span>
      <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink">
        BK-88 Stadium
      </span>
    </span>
  )
}
