'use server';

import { z } from 'zod';
import { postAuthPath } from '@/lib/auth/post-auth';
import { createClient } from '@/lib/supabase/server';

const emailSchema = z.string().trim().email();
const otpSchema = z
  .string()
  .trim()
  .min(4, 'Enter the verification code from your email')
  .max(12, 'Verification code is too long')
  .regex(
    /^[A-Za-z0-9]+$/,
    'Verification code can only contain letters and numbers',
  );

export type AuthActionResult = { ok: true } | { error: string };
export type VerifyOtpResult = { ok: true; redirectTo: string } | { error: string };

function parseEmail(email: string): string | null {
  const parsed = emailSchema.safeParse(email);
  return parsed.success ? parsed.data : null;
}

function safeNextPath(next: string): string {
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export async function sendOtpCode(email: string): Promise<AuthActionResult> {
  const parsedEmail = parseEmail(email);
  if (!parsedEmail) return { error: 'Enter a valid email address' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsedEmail,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) return { error: 'Could not send verification code' };
  return { ok: true };
}

export async function verifyOtpCode(
  email: string,
  token: string,
  next = '/',
): Promise<VerifyOtpResult> {
  const parsedEmail = parseEmail(email);
  if (!parsedEmail) return { error: 'Enter a valid email address' };

  const parsedToken = otpSchema.safeParse(token);
  if (!parsedToken.success) {
    return {
      error: parsedToken.error.issues[0]?.message ?? 'Enter the verification code',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsedEmail,
    token: parsedToken.data,
    type: 'email',
  });

  if (error) return { error: 'Invalid or expired verification code' };

  return {
    ok: true,
    redirectTo: await postAuthPath(supabase, safeNextPath(next)),
  };
}
