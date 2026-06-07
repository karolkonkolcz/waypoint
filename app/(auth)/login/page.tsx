import { OtpLoginForm } from './OtpLoginForm';

interface Props {
  searchParams: Promise<{ message?: string; error?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { message, error, next } = await searchParams;

  return (
    <main className="min-h-dvh overflow-hidden bg-[#f7f7f5] text-foreground">
      <OtpLoginForm
        initialMessage={message ? decodeURIComponent(message) : undefined}
        initialError={error ? decodeURIComponent(error) : undefined}
        next={next ?? '/'}
      />
    </main>
  );
}
