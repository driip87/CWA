import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_SIGN_IN_QUERY_PARAM = 'google_sign_in';
export const AUTH_MODE_QUERY_PARAM = 'auth_mode';

const CANONICAL_LOCALHOST = 'localhost';
const LOCALHOST_ALIASES = new Set(['127.0.0.1']);

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

const redirectGoogleSignInToCanonicalLocalhost = (authMode?: string) => {
  if (typeof window === 'undefined') {
    return false;
  }

  const currentUrl = new URL(window.location.href);
  if (!LOCALHOST_ALIASES.has(currentUrl.hostname)) {
    return false;
  }

  currentUrl.hostname = CANONICAL_LOCALHOST;
  currentUrl.searchParams.set(GOOGLE_SIGN_IN_QUERY_PARAM, '1');

  if (authMode) {
    currentUrl.searchParams.set(AUTH_MODE_QUERY_PARAM, authMode);
  } else {
    currentUrl.searchParams.delete(AUTH_MODE_QUERY_PARAM);
  }

  window.location.assign(currentUrl.toString());
  return true;
};

export const signInWithGoogle = async (options?: { authMode?: 'login' | 'signup' | 'reset' }) => {
  if (redirectGoogleSignInToCanonicalLocalhost(options?.authMode)) {
    return null;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google', error);
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out', error);
    throw error;
  }
};
