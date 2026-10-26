function Dashboard({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-svh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-6">
          <p className="text-sm font-semibold tracking-wide text-red-500">
            BK-88 Stadium
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:outline-green-400"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Welcome back. Your bookings will show up here.
        </p>
      </main>
    </div>
  )
}

export default Dashboard
