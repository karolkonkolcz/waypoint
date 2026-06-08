'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRightIcon,
  MailIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { WaypointLockup } from '@/components/brand/Waypoint';
import { sendOtpCode, verifyOtpCode } from './actions';

type Step = 'email' | 'verify';

interface OtpLoginFormProps {
  initialError?: string;
  initialMessage?: string;
  next?: string;
  photoUrl?: string;
}

const OTP_LENGTH = 6;

export function OtpLoginForm({ initialError, initialMessage, next = '/', photoUrl }: OtpLoginFormProps) {
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
    setMessage('Poslali jsme nový ověřovací kód.');
    otpInputRef.current?.focus();
  }

  function handleChangeEmail() {
    setStep('email');
    setToken('');
    setError('');
    setMessage('');
  }

  return (
    <section className="relative mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col overflow-hidden px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))] sm:max-w-[480px]">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,#273231_0%,#111717_55%,#080c0c_100%)]"
      />
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,10,10,0.66)_0%,rgba(6,10,10,0.34)_32%,rgba(6,10,10,0.82)_70%,rgba(6,10,10,0.98)_100%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-40 bg-black/35 blur-3xl" />

      <div className="relative z-10 flex w-full max-w-[430px] flex-1 flex-col">
        <header className="flex items-center justify-between gap-4">
          <WaypointLockup markSize={42} wordmarkClassName="!text-white" />
          <p className="text-right text-xs font-semibold uppercase text-white/72">
            Účet
          </p>
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
        <div className="rounded-[1.2rem] border border-white/16 bg-white/16 px-4 py-3 text-sm font-semibold leading-relaxed text-white backdrop-blur-md">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-[1.2rem] border border-red-200/30 bg-red-500/18 px-4 py-3 text-sm font-semibold leading-relaxed text-white backdrop-blur-md">
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
    <form onSubmit={onSubmit} className="mt-auto flex flex-col gap-5 pb-1 pt-8">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase text-[var(--wp-orange)]">
          Přístup k itinerářům
        </p>
        <h1 className="text-4xl font-extrabold leading-tight text-white drop-shadow-sm min-[390px]:text-5xl">
          Vítej zpátky
        </h1>
        <p className="max-w-[21rem] text-base font-medium leading-snug text-white/78 min-[390px]:text-lg">
          Zadej e-mail. Kódem se přihlásíš, nebo si rovnou založíš účet.
        </p>
      </div>

      <Notices error={error} message={message} />

      <div className="space-y-3 pt-1">
        <label htmlFor="email" className="block text-xs font-semibold uppercase text-white/66">
          E-mail
        </label>
        <div className="relative">
          <MailIcon
            className="pointer-events-none absolute left-5 top-1/2 size-6 -translate-y-1/2 text-[#1f262b]"
            strokeWidth={2.5}
            aria-hidden="true"
          />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="jmeno@email.cz"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="h-14 w-full rounded-2xl border border-white/18 bg-white/94 pl-[3.8rem] pr-4 text-base font-semibold text-[#1f262b] shadow-[0_10px_30px_rgba(0,0,0,0.16)] outline-none transition placeholder:text-[#1f262b]/45 focus:border-primary focus:ring-4 focus:ring-primary/20 min-[390px]:h-16 min-[390px]:text-lg"
          />
        </div>
      </div>

      <PrimaryButton disabled={pending || email.trim().length === 0}>
        {pending ? 'Posílám...' : 'Pokračovat e-mailem'}
      </PrimaryButton>

      <p className="flex items-start gap-3 rounded-2xl border border-white/14 bg-white/12 px-4 py-3 text-sm font-medium leading-relaxed text-white/76 backdrop-blur-md">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-white/78" strokeWidth={1.9} />
        <span>Stačí se jednou připojit. Trasy pak zůstanou dostupné bez připojení.</span>
      </p>

      <p className="text-center text-sm font-medium leading-relaxed text-white/62">
        Nový ve Waypointu? Tímhle krokem účet rovnou založíme.
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
    <form onSubmit={onSubmit} className="mt-auto flex flex-col gap-5 pb-1 pt-8">
      <div className="space-y-4">
        <div className="flex size-16 items-center justify-center rounded-[1.2rem] border border-white/14 bg-white/14 text-white backdrop-blur-md">
          <MailIcon className="size-8" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <h1 className="text-4xl font-extrabold leading-tight text-white drop-shadow-sm min-[390px]:text-5xl">
          Zkontroluj e-mail
        </h1>
        <p className="text-base font-medium leading-snug text-white/78 min-[390px]:text-lg">
          Zadej kód, který jsme poslali na{' '}
          <span className="font-semibold text-white">{email}</span>
        </p>
      </div>

      <Notices error={error} message={message} />

      <div className="relative pt-2" onClick={() => inputRef.current?.focus()}>
        <label htmlFor="otp" className="sr-only">
          Ověřovací kód
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
        <div className="grid grid-cols-6 gap-2" aria-hidden="true">
          {otpDigits.map((digit, index) => {
            const isActive = index === Math.min(token.length, OTP_LENGTH - 1);
            return (
              <div
                key={index}
                className={`flex aspect-[0.82] min-h-14 items-center justify-center rounded-2xl border bg-white/92 text-3xl font-bold text-[#1b2024] shadow-[0_10px_26px_rgba(0,0,0,0.12)] transition min-[390px]:min-h-16 min-[390px]:text-4xl ${
                  isActive
                    ? 'border-primary ring-4 ring-primary/20'
                    : 'border-white/16'
                }`}
              >
                {digit || (isActive ? <span className="h-8 w-1 rounded-full bg-primary" /> : null)}
              </div>
            );
          })}
        </div>
      </div>

      <PrimaryButton disabled={pending || token.trim().length === 0}>
        {pending ? 'Ověřuji...' : 'Potvrdit a pokračovat'}
      </PrimaryButton>

      <div className="flex items-center justify-center gap-5 text-sm font-semibold min-[390px]:text-base">
        <button
          type="button"
          onClick={onResend}
          disabled={pending}
          className="text-primary disabled:opacity-50"
        >
          Poslat znovu
        </button>
        <span className="text-white/42" aria-hidden="true">
          •
        </span>
        <button
          type="button"
          onClick={onChangeEmail}
          disabled={pending}
          className="text-white disabled:opacity-50"
        >
          Změnit e-mail
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-white/14 bg-white/12 px-4 py-3 text-sm font-medium leading-relaxed text-white/76 backdrop-blur-md">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-white/78" strokeWidth={1.9} />
        <p>Po přihlášení zůstanou stažené trasy, počasí i mapy dostupné bez připojení.</p>
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
      className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-white shadow-[0_18px_36px_rgba(243,112,19,0.32)] transition hover:bg-primary/95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:bg-primary/82 disabled:text-white/90 min-[390px]:h-16 min-[390px]:text-lg"
    >
      <span>{children}</span>
      <ArrowRightIcon className="size-5" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
