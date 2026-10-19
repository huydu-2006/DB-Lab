function Login() {
  return (
    <div className="grid min-h-svh md:grid-cols-[1.1fr_1fr]">
      <aside
        aria-label="DB-Lab Football"
        className="pitch-bg relative flex min-h-[200px] flex-col justify-between overflow-hidden p-8 text-green-50 before:absolute before:inset-x-[6%] before:top-1/2 before:h-0.5 before:bg-white/20 after:absolute after:left-1/2 after:top-1/2 after:aspect-square after:w-[min(46%,280px)] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:border-white/20 md:min-h-0 md:p-14"
      >
        <p className="relative z-10 text-sm font-semibold tracking-wide text-red-400">
          BK-88 Stadium
        </p>
        <p className="relative z-10 max-w-md text-3xl font-semibold leading-tight md:text-5xl">
          Your matchday command centre.
        </p>
      </aside>

      <main className="grid place-items-center bg-white p-6 md:p-10 dark:bg-slate-950">
        <form
          onSubmit={(event) => event.preventDefault()}
          className="flex w-full max-w-sm flex-col gap-4"
        >
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Welcome back
          </h1>
          <p className="-mt-2 text-sm text-slate-500 dark:text-slate-400">
            Sign in to continue.
          </p>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-sm font-medium text-slate-900 dark:text-slate-200"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus-visible:border-green-700 focus-visible:ring-2 focus-visible:ring-green-700/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus-visible:border-green-400 dark:focus-visible:ring-green-400/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-sm font-medium text-slate-900 dark:text-slate-200"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus-visible:border-green-700 focus-visible:ring-2 focus-visible:ring-green-700/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus-visible:border-green-400 dark:focus-visible:ring-green-400/30"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                name="remember"
                className="accent-green-700 dark:accent-green-400"
              />
              Remember me
            </label>
            <a
              href="#"
              className="text-green-700 hover:underline dark:text-green-400"
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:bg-green-400 dark:text-green-950 dark:hover:bg-green-300 dark:focus-visible:outline-green-400"
          >
            Sign in
          </button>
        </form>
      </main>
    </div>
  )
}

export default Login
