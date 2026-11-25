/**
 * Login (Supabase Auth) e trava de PIN (RPCs get_pin_status / set_pin / verify_pin / reset_pin).
 * O PIN é trava de tela sobre uma sessão já autenticada; quem protege os dados é a RLS.
 * No modo local (testes), o PIN fica no navegador só para exercitar a tela.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { reportRpcError } from '../lib/monitoring';

export const isLocalMode = import.meta.env.VITE_LOCAL_MODE === '1';

export type PinStatus = { configured: boolean; retryAfter: number | null };
export type PinResult =
  'ok' | 'invalid' | 'invalid_format' | 'locked' | 'already_configured' | 'reauth_required';

export const PIN_RE = /^\d{4,8}$/;

export interface Auth {
  session(): Promise<Session | null | 'local'>;
  onChange(cb: () => void): () => void;
  signIn(email: string, password: string): Promise<string>;
  sendLink(email: string): Promise<string>;
  signOut(): Promise<void>;
  pinStatus(): Promise<PinStatus>;
  setPin(pin: string): Promise<PinResult>;
  verifyPin(pin: string): Promise<{ result: PinResult; retryAfter?: number }>;
  resetPin(): Promise<PinResult>;
}

export const supabaseAuth = (): Auth => {
  const sb = supabase!;
  const rpc = async (fn: string, args?: object) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      reportRpcError(fn, error);
      throw new Error(error.message);
    }
    return data as Record<string, unknown>;
  };
  return {
    async session() {
      return (await sb.auth.getSession()).data.session;
    },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return error ? 'E-mail ou senha incorretos.' : '';
    },
    async sendLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: location.origin },
      });
      return error ? 'Não consegui enviar o link: ' + error.message : '';
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async pinStatus() {
      const r = await rpc('get_pin_status');
      return { configured: !!r.configured, retryAfter: (r.retry_after_seconds as number) ?? null };
    },
    async setPin(pin) {
      const r = await rpc('set_pin', { candidate_pin: pin });
      return r.status === 'ok' ? 'ok' : (r.status as PinResult);
    },
    async verifyPin(pin) {
      const r = await rpc('verify_pin', { candidate_pin: pin });
      const s = r.status === 'success' ? 'ok' : (r.status as PinResult);
      return { result: s, retryAfter: r.retry_after_seconds as number | undefined };
    },
    async resetPin() {
      return (await rpc('reset_pin')).status as PinResult;
    },
  };
};

export const localAuth = (storage: Storage = localStorage): Auth => {
  const K = 'rateio.local.pin';
  return {
    async session() {
      return 'local';
    },
    onChange() {
      return () => {};
    },
    async signIn() {
      return '';
    },
    async sendLink() {
      return '';
    },
    async signOut() {},
    async pinStatus() {
      return { configured: !!storage.getItem(K), retryAfter: null };
    },
    async setPin(pin) {
      if (!PIN_RE.test(pin)) return 'invalid_format';
      if (storage.getItem(K)) return 'already_configured';
      storage.setItem(K, pin);
      return 'ok';
    },
    async verifyPin(pin) {
      return { result: storage.getItem(K) === pin ? 'ok' : 'invalid' };
    },
    async resetPin() {
      storage.removeItem(K);
      return 'ok';
    },
  };
};
