import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

type UserRole = 'driver' | 'eater';

interface UserContextType {
  session: Session | null;
  role: UserRole | null;
  name: string;
  email: string;
  loading: boolean;
  signUp: (email: string, password: string, name: string, role: UserRole) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    try {
      const profile = await api.getProfile();
      console.log('[Auth] Profile from backend:', JSON.stringify(profile));
      setRole(profile.role as UserRole);
      setName(profile.name);
      setEmail(profile.email);
    } catch (err) {
      console.log('[Auth] Could not refresh profile:', err);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setRole(null);
        setName('');
        setEmail('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (user: User) => {
    setEmail(user.email || '');
    // Load from metadata first
    const metadata = user.user_metadata;
    console.log('[Auth] User metadata:', JSON.stringify(metadata));
    if (metadata) {
      console.log('[Auth] Setting role from metadata:', metadata.role);
      setRole(metadata.role || 'eater');
      setName(metadata.name || '');
    }
    // Then fetch from backend to get the real data
    await refreshProfile();

    // Register push notifications on every app start
    try {
      const { registerForPushNotifications, savePushToken } = await import('../lib/notifications');
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(token);
        console.log('[Auth] Push token registered');
      }
    } catch (err) {
      console.log('[Auth] Push token error:', err);
    }
  };

  const signUp = async (email: string, password: string, name: string, role: UserRole) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role,
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signOut = async () => {
    if (role === 'driver') {
      try {
        await api.updateDriverProfile({ is_online: false });
      } catch {}
      try {
        const { stopBackgroundLocation } = await import('../lib/backgroundLocation');
        await stopBackgroundLocation();
      } catch {}
    }
    await supabase.auth.signOut();
    setRole(null);
    setName('');
    setEmail('');
  };

  return (
    <UserContext.Provider
      value={{
        session,
        role,
        name,
        email,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
