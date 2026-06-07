'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { sendOtpCode, verifyOtpCode } from './actions';

type Step = 'email' | 'verify';

interface OtpLoginFormProps {
  initialError?: string;
  initialMessage?: string;
  next?: string;
}

export function OtpLoginForm({ initialError, initialMessage, next = '/' }: OtpLoginFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState(initialMessage ?? '');
  const [error, setError] = useState(initialError ?? '');
  const [pending, setPending] = useState(false);

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');

    const result = await sendOtpCode(email);
    setPending(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    setStep('verify');
    setToken('');
    setMessage('Check your email for the verification code.');
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');

    const result = await verifyOtpCode(email, token, next);

    if ('error' in result) {
      setPending(false);
      setError(result.error);
      return;
    }

    router.replace(result.redirectTo);
    router.refresh();
  }

  async function handleResendCode() {
    setPending(true);
    setError('');
    setMessage('');

    const result = await sendOtpCode(email);
    setPending(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    setToken('');
    setMessage('We sent a new verification code.');
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Waypoint</h1>
        <p className="text-sm text-muted-foreground">
          {step === 'email'
            ? 'Sign in or create an account with a one-time email code'
            : 'Enter the code we sent to your email'}
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === 'email' ? (
        <form onSubmit={handleSendCode} className="space-y-4">
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={pending || email.trim().length === 0}
            className="w-full rounded-full bg-primary px-4 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {pending ? 'Sending…' : 'Send verification code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
            We sent a code to <span className="font-medium text-foreground">{email}</span>.
          </div>

          <div className="space-y-2">
            <label htmlFor="otp" className="text-sm font-medium">
              Verification code
            </label>
            <input
              id="otp"
              name="otp"
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="input text-center text-xl tracking-[0.35em]"
            />
          </div>

          <button
            type="submit"
            disabled={pending || token.trim().length === 0}
            className="w-full rounded-full bg-primary px-4 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {pending ? 'Verifying…' : 'Verify code'}
          </button>

          <div className="grid gap-3 text-center text-sm">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={pending}
              className="text-primary hover:text-primary/80 disabled:opacity-50"
            >
              Send a new code
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setToken('');
                setError('');
                setMessage('');
              }}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        New emails create an account automatically. After sign-in, Waypoint works fully offline.
      </p>
    </div>
  );
}
