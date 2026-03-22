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
import { auth, db, logOut } from '../lib/firebase';
import { getUserProfileImageUrl } from '../lib/storage';
import type { ClaimStatus } from '../shared/customer';
import { getBootstrapErrorMessage, runBootstrapWithRetry } from './bootstrapRecovery';

const CLAIM_SESSION_KEY = 'cw_claim_token';

interface AccountData {
  tenantId?: string;
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
  tenantId?: string;
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
  billingProvider?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePriceId?: string | null;
  subscriptionPlanName?: string | null;
  subscriptionAmount?: number | null;
  subscriptionCurrency?: string | null;
  subscriptionInterval?: string | null;
  subscriptionCurrentPeriodStart?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  subscriptionCanceledAt?: string | null;
  subscriptionActivatedAt?: string | null;
  subscriptionUpdatedAt?: string | null;
}

interface BootstrapPayload {
  account: AccountData;
  customer: UserData | null;
}

interface RefreshSessionOptions {
  claimToken?: string | null;
  profileName?: string | null;
}

interface AuthContextType {
  user: User | null;
  accountData: AccountData | null;
  userData: UserData | null;
  profileImageUrl: string | null;
  loading: boolean;
  bootstrapped: boolean;
  bootstrapRecovering: boolean;
  bootstrapError: string | null;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signupWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  claimAccount: (email: string, pass: string, token: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshSession: (claimToken?: string | null) => Promise<BootstrapPayload | null>;
  refreshProfileImage: () => Promise<string | null>;
  retryBootstrap: () => Promise<void>;
  signOutForRecovery: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accountData: null,
  userData: null,
  profileImageUrl: null,
  loading: true,
  bootstrapped: false,
  bootstrapRecovering: false,
  bootstrapError: null,
  loginWithEmail: async () => {},
  signupWithEmail: async () => {},
  resetPassword: async () => {},
  claimAccount: async () => {},
  resendVerification: async () => {},
  refreshSession: async () => null,
  refreshProfileImage: async () => null,
  retryBootstrap: async () => {},
  signOutForRecovery: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapRecovering, setBootstrapRecovering] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const unsubscribers = useRef<Array<() => void>>([]);
  const bootstrapRunRef = useRef(0);
  const bootstrapPromiseRef = useRef<Promise<BootstrapPayload | null> | null>(null);

  const cleanupSubscriptions = () => {
    unsubscribers.current.forEach((unsubscribe) => unsubscribe());
    unsubscribers.current = [];
  };

  const clearSessionData = () => {
    cleanupSubscriptions();
    setAccountData(null);
    setUserData(null);
    setProfileImageUrl(null);
    setBootstrapped(false);
  };

  const failBootstrap = (error: unknown) => {
    clearSessionData();
    setBootstrapError(getBootstrapErrorMessage(error));
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

  const refreshSessionOnce = async (options: RefreshSessionOptions = {}) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      clearSessionData();
      setBootstrapError(null);
      return null;
    }

    const token = options.claimToken ?? sessionStorage.getItem(CLAIM_SESSION_KEY);
    const payload = await apiAuthedPost<BootstrapPayload>('/api/auth/bootstrap', {
      claimToken: token || null,
      profileName: options.profileName || null,
    });
    if (token) {
      sessionStorage.removeItem(CLAIM_SESSION_KEY);
    }
    attachSnapshots(currentUser, payload);
    return payload;
  };

  const refreshSession = async (claimToken?: string | null) => {
    if (bootstrapPromiseRef.current) {
      return bootstrapPromiseRef.current;
    }

    const runId = ++bootstrapRunRef.current;
    setBootstrapRecovering(true);
    setBootstrapError(null);

    const request = runBootstrapWithRetry(() => refreshSessionOnce({ claimToken }), {
      attempts: 3,
      baseDelayMs: 250,
    })
      .then((payload) => {
        if (bootstrapRunRef.current === runId) {
          setBootstrapped(Boolean(auth.currentUser) ? Boolean(payload?.account && payload?.customer) : false);
          setBootstrapError(null);
        }
        return payload;
      })
      .catch((error) => {
        if (bootstrapRunRef.current === runId) {
          failBootstrap(error);
        }
        throw error;
      })
      .finally(() => {
        if (bootstrapRunRef.current === runId) {
          setBootstrapRecovering(false);
        }
        bootstrapPromiseRef.current = null;
      });

    bootstrapPromiseRef.current = request;
    return request;
  };

  const refreshProfileImage = async () => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      setProfileImageUrl(null);
      return null;
    }

    const url = await getUserProfileImageUrl(currentUid);
    if (auth.currentUser?.uid === currentUid) {
      setProfileImageUrl(url);
    }
    return url;
  };

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
    await refreshSession();
  };

  const signupWithEmail = async (email: string, pass: string, name: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(userCredential.user, { displayName: name });
    await userCredential.user.getIdToken(true);
    await sendEmailVerification(userCredential.user);
    const payload = await runBootstrapWithRetry(
      () => refreshSessionOnce({ profileName: name.trim() || null }),
      {
        attempts: 3,
        baseDelayMs: 250,
      },
    );
    setBootstrapped(Boolean(payload?.account && payload?.customer));
    setBootstrapError(null);
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

  const retryBootstrap = async () => {
    if (!auth.currentUser) {
      throw new Error('No signed-in user');
    }

    setLoading(true);
    try {
      await refreshSession();
    } finally {
      setLoading(false);
    }
  };

  const signOutForRecovery = async () => {
    bootstrapRunRef.current += 1;
    bootstrapPromiseRef.current = null;
    clearSessionData();
    setBootstrapError(null);
    setBootstrapRecovering(false);
    await logOut();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        bootstrapRunRef.current += 1;
        bootstrapPromiseRef.current = null;
        clearSessionData();
        setBootstrapError(null);
        setBootstrapRecovering(false);
        setLoading(false);
        return;
      }

      setLoading(true);

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

  useEffect(() => {
    if (!user) {
      setProfileImageUrl(null);
      return;
    }

    refreshProfileImage().catch((error) => {
      console.error('Failed to refresh profile image', error);
    });
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accountData,
        userData,
        profileImageUrl,
        loading,
        bootstrapped,
        bootstrapRecovering,
        bootstrapError,
        loginWithEmail,
        signupWithEmail,
        resetPassword,
        claimAccount,
        resendVerification,
        refreshSession,
        refreshProfileImage,
        retryBootstrap,
        signOutForRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
