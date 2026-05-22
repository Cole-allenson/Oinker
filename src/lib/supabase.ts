import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// Custom storage adapter using expo-secure-store
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// Replace these with your actual Supabase credentials
const SUPABASE_URL = 'https://ucovpdohyahwbhujsyyi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjb3ZwZG9oeWFod2JodWpzeXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNDk3OTEsImV4cCI6MjA5NDgyNTc5MX0.p0LazZeI1VJQn2jy9XDxFHrBLo-Ge9Mmu1bJ9Hb3mLc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
