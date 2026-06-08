'use server';

import { z } from 'zod';
import { postAuthPath } from '@/lib/auth/post-auth';
import { createClient } from '@/lib/supabase/server';

const emailSchema = z.string().trim().email();
const otpSchema = z
  .string()
  .trim()
  .min(4, 'Zadej ověřovací kód z e-mailu')
  .max(12, 'Ověřovací kód je příliš dlouhý')
  .regex(
    /^[A-Za-z0-9]+$/,
    'Ověřovací kód může obsahovat jen písmena a číslice',
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
  if (!parsedEmail) return { error: 'Zadej platnou e-mailovou adresu' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsedEmail,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) return { error: 'Ověřovací kód se nepodařilo poslat' };
  return { ok: true };
}

export async function verifyOtpCode(
  email: string,
  token: string,
  next = '/',
): Promise<VerifyOtpResult> {
  const parsedEmail = parseEmail(email);
  if (!parsedEmail) return { error: 'Zadej platnou e-mailovou adresu' };

  const parsedToken = otpSchema.safeParse(token);
  if (!parsedToken.success) {
    return {
      error: parsedToken.error.issues[0]?.message ?? 'Zadej ověřovací kód',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsedEmail,
    token: parsedToken.data,
    type: 'email',
  });

  if (error) return { error: 'Ověřovací kód je neplatný nebo vypršel' };

  return {
    ok: true,
    redirectTo: await postAuthPath(supabase, safeNextPath(next)),
  };
}
