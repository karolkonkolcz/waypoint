import { loginWithMagicLink } from './actions';
import { SessionCatcher } from './SessionCatcher';

interface Props {
  searchParams: Promise<{ message?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { message, error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <SessionCatcher />
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Waypoint</h1>
          <p className="text-muted-foreground text-sm">
            Sign in to access your hiking itineraries
          </p>
        </div>

        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300">
            {decodeURIComponent(message)}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={loginWithMagicLink} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="input"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-primary px-4 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Send magic link
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          After sign-in, Waypoint works fully offline.
        </p>
      </div>
    </main>
  );
}
