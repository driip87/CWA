import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { apiAuthedPost } from '../lib/api';
import { auth, db } from '../lib/firebase';
import type { ClaimStatus } from '../shared/customer';

const CLAIM_SESSION_KEY = 'cw_claim_token';

interface AccountData {
  email: string;
  role: 'user' | 'admin';
  customerId: string | null;
  providers: string[];
  emailVerified: boolean;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string;
}

interface UserData {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  phone?: string;
  address?: string;
  createdAt: string;
  subscriptionStatus?: 'active' | 'inactive';
  claimStatus?: ClaimStatus;
  linkedAuthUid?: string | null;
  pendingLinkedAuthUid?: string | null;
  imported?: boolean;
  importSource?: string | null;
  importBatchId?: string | null;
  normalizedEmail?: string | null;
  normalizedPhone?: string | null;
  normalizedAddress?: string | null;
  plan?: string;
  collectionDay?: string;
  recordStatus?: 'active' | 'archived';
  latestInviteId?: string | null;
  latestInviteSentAt?: string | null;
  latestInviteExpiresAt?: string | null;
  latestInviteResendCount?: number;
}

interface BootstrapPayload {
  account: AccountData;
  customer: UserData | null;
}

interface AuthContextType {
  user: User | null;
  accountData: AccountData | null;
  userData: UserData | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signupWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  claimAccount: (email: string, pass: string, token: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshSession: (claimToken?: string | null) => Promise<BootstrapPayload | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accountData: null,
  userData: null,
  loading: true,
  loginWithEmail: async () => {},
  signupWithEmail: async () => {},
  resetPassword: async () => {},
  claimAccount: async () => {},
  resendVerification: async () => {},
  refreshSession: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const unsubscribers = useRef<Array<() => void>>([]);

  const cleanupSubscriptions = () => {
    unsubscribers.current.forEach((unsubscribe) => unsubscribe());
    unsubscribers.current = [];
  };

  const attachSnapshots = (currentUser: User, payload: BootstrapPayload) => {
    cleanupSubscriptions();
    setAccountData(payload.account);
    setUserData(payload.customer);

    unsubscribers.current.push(
      onSnapshot(doc(db, 'accounts', currentUser.uid), (snapshot) => {
        if (snapshot.exists()) {
          setAccountData(snapshot.data() as AccountData);
        }
      }),
    );

    if (payload.customer?.id) {
      unsubscribers.current.push(
        onSnapshot(doc(db, 'users', payload.customer.id), (snapshot) => {
          if (snapshot.exists()) {
            setUserData({ id: snapshot.id, ...(snapshot.data() as Omit<UserData, 'id'>) });
          }
        }),
      );
    }
  };

  const refreshSession = async (claimToken?: string | null) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setAccountData(null);
      setUserData(null);
      return null;
    }

    const token = claimToken ?? sessionStorage.getItem(CLAIM_SESSION_KEY);
    const payload = await apiAuthedPost<BootstrapPayload>('/api/auth/bootstrap', {
      claimToken: token || null,
    });
    if (token) {
      sessionStorage.removeItem(CLAIM_SESSION_KEY);
    }
    attachSnapshots(currentUser, payload);
    return payload;
  };

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
    await refreshSession();
  };

  const signupWithEmail = async (email: string, pass: string, name: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(userCredential.user, { displayName: name });
    await sendEmailVerification(userCredential.user);
    const payload = await refreshSession();
    const customerId = payload?.customer?.id;
    if (customerId) {
      await updateDoc(doc(db, 'users', customerId), { name });
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const claimAccount = async (email: string, pass: string, token: string) => {
    sessionStorage.setItem(CLAIM_SESSION_KEY, token);
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(userCredential.user);
    await refreshSession(token);
  };

  const resendVerification = async () => {
    if (!auth.currentUser) {
      throw new Error('No signed-in user');
    }
    await sendEmailVerification(auth.currentUser);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        cleanupSubscriptions();
        setAccountData(null);
        setUserData(null);
        setLoading(false);
        return;
      }

      try {
        await refreshSession();
      } catch (error) {
        console.error('Failed to refresh session', error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      cleanupSubscriptions();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accountData,
        userData,
        loading,
        loginWithEmail,
        signupWithEmail,
        resetPassword,
        claimAccount,
        resendVerification,
        refreshSession,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};
