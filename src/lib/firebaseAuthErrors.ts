const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with that email already exists.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed':
    'Email/password sign-up is not enabled for this Firebase project. Enable the Email/Password provider in Firebase Authentication before creating accounts.',
  'auth/unauthorized-domain':
    'Google sign-in is not allowed from this local app origin yet. Use http://localhost:3000 or add this origin to Firebase Authentication authorized domains.',
  'auth/popup-closed-by-user': 'Google sign-in was canceled before completion.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Allow popups and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/user-not-found': 'No account was found for that email address.',
  'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
  'auth/wrong-password': 'The email or password is incorrect.',
};

export function getFirebaseAuthErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = String((error as { code?: unknown }).code);
    if (code in AUTH_ERROR_MESSAGES) {
      return AUTH_ERROR_MESSAGES[code];
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
