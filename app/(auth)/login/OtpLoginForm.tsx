'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  MailIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { sendOtpCode, verifyOtpCode } from './actions';

type Step = 'email' | 'verify';

interface OtpLoginFormProps {
  initialError?: string;
  initialMessage?: string;
  next?: string;
}

const OTP_LENGTH = 6;

export function OtpLoginForm({ initialError, initialMessage, next = '/' }: OtpLoginFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState(initialMessage ?? '');
  const [error, setError] = useState(initialError ?? '');
  const [pending, setPending] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const otpDigits = useMemo(
    () => Array.from({ length: OTP_LENGTH }, (_, index) => token[index] ?? ''),
    [token],
  );

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
    setMessage('');
    requestAnimationFrame(() => otpInputRef.current?.focus());
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
    otpInputRef.current?.focus();
  }

  function handleChangeEmail() {
    setStep('email');
    setToken('');
    setError('');
    setMessage('');
  }

  return (
    <section className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))] shadow-[0_0_90px_rgba(47,55,61,0.08)] sm:max-w-none sm:items-center">
      <TopographicBackground />

      <div className="relative z-10 flex w-full max-w-[430px] flex-1 flex-col">
        <header className="flex items-center justify-between pb-12 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex size-16 items-center justify-center rounded-full border border-[#e6e5e1] bg-white/90 text-[#242b30] shadow-[0_2px_8px_rgba(47,55,61,0.08)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronLeftIcon className="size-8" strokeWidth={3} />
          </button>

          <MapPinIcon
            className="absolute left-1/2 top-12 size-12 -translate-x-1/2 fill-primary text-primary"
            strokeWidth={2.5}
            aria-hidden="true"
          />

          <div aria-hidden="true" className="size-16" />
        </header>

        {step === 'email' ? (
          <EmailStep
            email={email}
            error={error}
            message={message}
            pending={pending}
            onEmailChange={setEmail}
            onSubmit={handleSendCode}
          />
        ) : (
          <VerifyStep
            email={email}
            error={error}
            message={message}
            otpDigits={otpDigits}
            pending={pending}
            token={token}
            inputRef={otpInputRef}
            onTokenChange={setToken}
            onSubmit={handleVerifyCode}
            onResend={handleResendCode}
            onChangeEmail={handleChangeEmail}
          />
        )}
      </div>
    </section>
  );
}

interface NoticeProps {
  error: string;
  message: string;
}

function Notices({ error, message }: NoticeProps) {
  if (!error && !message) return null;

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {message && (
        <div className="rounded-3xl border border-[#d8ddb9] bg-[#f0f1e7]/95 px-5 py-4 text-base font-semibold leading-relaxed text-[#657020]">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-3xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-base font-semibold leading-relaxed text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

interface EmailStepProps extends NoticeProps {
  email: string;
  pending: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function EmailStep({ email, error, message, pending, onEmailChange, onSubmit }: EmailStepProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-8 pt-10">
      <div className="space-y-5">
        <h1 className="text-6xl font-black tracking-[-0.075em] text-[#1b2024] min-[390px]:text-[4.4rem]">
          Welcome back
        </h1>
        <p className="max-w-[19rem] text-3xl font-semibold leading-snug tracking-[-0.045em] text-[#8b8c86]">
          Enter your email and we&rsquo;ll send you a one-time code.
        </p>
      </div>

      <Notices error={error} message={message} />

      <div className="space-y-3 pt-9">
        <label htmlFor="email" className="block text-xl font-black uppercase tracking-wide text-[#8b8c86]">
          Email
        </label>
        <div className="relative">
          <MailIcon
            className="pointer-events-none absolute left-6 top-1/2 size-8 -translate-y-1/2 text-[#1f262b]"
            strokeWidth={2.5}
            aria-hidden="true"
          />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="marek@waypoint.app"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="h-20 w-full rounded-[1.65rem] border border-[#e2e1dc] bg-white/95 pl-[4.8rem] pr-5 text-2xl font-bold tracking-[-0.035em] text-[#1f262b] shadow-[0_2px_10px_rgba(47,55,61,0.04)] outline-none transition placeholder:text-[#1f262b] focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </div>
      </div>

      <PrimaryButton disabled={pending || email.trim().length === 0}>
        {pending ? 'Sending…' : 'Send code'}
      </PrimaryButton>

      <p className="flex items-start gap-4 text-xl font-semibold leading-relaxed tracking-[-0.045em] text-[#8b8c86]">
        <ShieldCheckIcon className="mt-1 size-7 shrink-0 text-[#8b8c86]" strokeWidth={1.8} />
        <span>You&rsquo;ll need internet once to sign in. Your saved trails stay available offline.</span>
      </p>

      <p className="mt-auto pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-2xl font-bold tracking-[-0.045em] text-[#8b8c86]">
        New to Waypoint?{' '}
        <button type="submit" disabled={pending} className="text-primary disabled:opacity-50">
          Create account
        </button>
      </p>
    </form>
  );
}

interface VerifyStepProps extends NoticeProps {
  email: string;
  otpDigits: string[];
  pending: boolean;
  token: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onTokenChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResend: () => void;
  onChangeEmail: () => void;
}

function VerifyStep({
  email,
  error,
  message,
  otpDigits,
  pending,
  token,
  inputRef,
  onTokenChange,
  onSubmit,
  onResend,
  onChangeEmail,
}: VerifyStepProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-8 pt-8">
      <div className="flex size-28 items-center justify-center rounded-[1.75rem] bg-primary/10 text-[#1f262b]">
        <MailIcon className="size-12" strokeWidth={2.5} aria-hidden="true" />
      </div>

      <div className="space-y-4">
        <h1 className="text-6xl font-black tracking-[-0.075em] text-[#1b2024] min-[390px]:text-[4.15rem]">
          Check your email
        </h1>
        <p className="text-2xl font-semibold leading-snug tracking-[-0.045em] text-[#8b8c86] min-[390px]:text-[1.7rem]">
          Enter the code we sent to{' '}
          <span className="font-black text-[#1b2024]">{email}</span>
        </p>
      </div>

      <Notices error={error} message={message} />

      <div className="relative pt-2" onClick={() => inputRef.current?.focus()}>
        <label htmlFor="otp" className="sr-only">
          Verification code
        </label>
        <input
          ref={inputRef}
          id="otp"
          name="otp"
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          value={token}
          maxLength={OTP_LENGTH}
          onChange={(event) => onTokenChange(event.target.value.replace(/\s/g, '').slice(0, OTP_LENGTH))}
          className="sr-only"
        />
        <div className="grid grid-cols-6 gap-3" aria-hidden="true">
          {otpDigits.map((digit, index) => {
            const isActive = index === Math.min(token.length, OTP_LENGTH - 1);
            return (
              <div
                key={index}
                className={`flex aspect-[0.78] min-h-16 items-center justify-center rounded-[1.35rem] border bg-white/90 text-5xl font-black tracking-[-0.05em] text-[#1b2024] shadow-[0_2px_8px_rgba(47,55,61,0.04)] transition ${
                  isActive
                    ? 'border-primary ring-8 ring-primary/10'
                    : 'border-[#e2e1dc]'
                }`}
              >
                {digit || (isActive ? <span className="h-10 w-1 rounded-full bg-primary" /> : null)}
              </div>
            );
          })}
        </div>
      </div>

      <PrimaryButton disabled={pending || token.trim().length === 0}>
        {pending ? 'Verifying…' : 'Verify code'}
      </PrimaryButton>

      <div className="flex items-center justify-center gap-7 text-2xl font-black tracking-[-0.045em]">
        <button
          type="button"
          onClick={onResend}
          disabled={pending}
          className="text-primary disabled:opacity-50"
        >
          Resend code
        </button>
        <span className="text-[#b2b2aa]" aria-hidden="true">
          •
        </span>
        <button
          type="button"
          onClick={onChangeEmail}
          disabled={pending}
          className="text-[#2f373d] disabled:opacity-50"
        >
          Change email
        </button>
      </div>

      <div className="mt-auto mb-[max(1rem,env(safe-area-inset-bottom))] flex items-start gap-4 rounded-[1.65rem] border border-[#d8ddb9] bg-[#f0f1e7]/95 px-5 py-5 text-xl font-bold leading-relaxed tracking-[-0.045em] text-[#657020]">
        <ShieldCheckIcon className="mt-1 size-7 shrink-0 text-[#2f373d]" strokeWidth={1.8} />
        <p>After sign-in, downloaded trails, weather snapshots and maps remain available offline.</p>
      </div>
    </form>
  );
}

interface PrimaryButtonProps {
  children: React.ReactNode;
  disabled: boolean;
}

function PrimaryButton({ children, disabled }: PrimaryButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex h-20 w-full items-center justify-center gap-5 rounded-[1.35rem] bg-primary px-5 text-3xl font-black tracking-[-0.055em] text-white shadow-[0_22px_38px_rgba(243,112,19,0.22)] transition hover:bg-primary/95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>{children}</span>
      {!disabled && <ArrowRightIcon className="size-9" strokeWidth={2.5} aria-hidden="true" />}
    </button>
  );
}

function TopographicBackground() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-full w-full text-[#e8e8e3]"
      viewBox="0 0 430 932"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path d="M-24 82C44 59 117 71 184 96C260 124 301 67 454 55" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <path d="M-32 146C56 130 120 149 191 169C286 196 310 111 462 114" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
      <path d="M-24 244C64 229 116 250 199 270C302 294 314 184 454 198" stroke="currentColor" strokeWidth="1.5" opacity="0.62" />
      <path d="M-24 338C71 322 127 337 207 356C291 376 327 270 454 283" stroke="currentColor" strokeWidth="1.5" opacity="0.62" />
      <path d="M-28 438C55 422 123 438 211 457C294 475 318 375 461 397" stroke="currentColor" strokeWidth="1.5" opacity="0.56" />
      <path d="M-32 536C64 519 127 535 209 552C302 571 329 474 459 490" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}
