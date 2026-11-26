/**
 * Login (Supabase Auth). Quem protege os dados é a RLS.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const isLocalMode = import.meta.env.VITE_LOCAL_MODE === '1';

export interface Auth {
  session(): Promise<Session | null | 'local'>;
  onChange(cb: () => void): () => void;
  signIn(email: string, password: string): Promise<string>;
  sendLink(email: string): Promise<string>;
  signOut(): Promise<void>;
}

export const supabaseAuth = (): Auth => {
  const sb = supabase!;
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
  };
};

export const localAuth = (): Auth => {
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
  };
};
