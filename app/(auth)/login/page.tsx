import { OtpLoginForm } from './OtpLoginForm';

interface Props {
  searchParams: Promise<{ message?: string; error?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { message, error, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <OtpLoginForm
        initialMessage={message ? decodeURIComponent(message) : undefined}
        initialError={error ? decodeURIComponent(error) : undefined}
        next={next ?? '/'}
      />
    </main>
  );
}
