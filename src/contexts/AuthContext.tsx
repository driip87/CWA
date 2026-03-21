import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, addDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface UserData {
  id: string;
  uid: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  phone?: string;
  address?: string;
  createdAt: string;
  subscriptionStatus?: 'active' | 'inactive';
  status?: 'active' | 'staged';
  claimToken?: string | null;
  plan?: string;
  collectionDay?: string;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signupWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  claimAccount: (email: string, pass: string, token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  userData: null, 
  loading: true,
  loginWithEmail: async () => {},
  signupWithEmail: async () => {},
  resetPassword: async () => {},
  claimAccount: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signupWithEmail = async (email: string, pass: string, name: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(userCredential.user, { displayName: name });
    
    // Wait a bit for onAuthStateChanged to create the document, then update it with the name
    setTimeout(async () => {
      const q = query(collection(db, 'users'), where('uid', '==', userCredential.user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, 'users', snap.docs[0].id), { name: name });
      }
    }, 2000);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const claimAccount = async (email: string, pass: string, token: string) => {
    // Verify token exists in db first
    const q = query(collection(db, 'users'), where('email', '==', email), where('claimToken', '==', token), where('status', '==', 'staged'));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      throw new Error('Invalid or expired claim token');
    }

    // Create the auth user
    // onAuthStateChanged will handle claiming the staged account
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  useEffect(() => {
    let unsubscribeDoc: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // 1. Try to find by UID
        const q = query(collection(db, 'users'), where('uid', '==', currentUser.uid));
        const snap = await getDocs(q);
        
        let userDocId = '';
        
        if (!snap.empty) {
          userDocId = snap.docs[0].id;
        } else {
          // 2. Try to find staged account by email
          const emailQ = query(collection(db, 'users'), where('email', '==', currentUser.email), where('status', '==', 'staged'));
          const emailSnap = await getDocs(emailQ);
          
          if (!emailSnap.empty) {
            // Claim the account
            userDocId = emailSnap.docs[0].id;
            await updateDoc(doc(db, 'users', userDocId), {
              uid: currentUser.uid,
              status: 'active',
              claimToken: null
            });
          } else {
            // 3. Create new account
            const isAdmin = currentUser.email === 'kereeonmiller@gmail.com';
            const newDocRef = await addDoc(collection(db, 'users'), {
              uid: currentUser.uid,
              email: currentUser.email || '',
              name: currentUser.displayName || '',
              role: isAdmin ? 'admin' : 'user',
              createdAt: new Date().toISOString(),
              subscriptionStatus: isAdmin ? 'active' : 'inactive',
              status: 'active'
            });
            userDocId = newDocRef.id;
          }
        }
        
        unsubscribeDoc = onSnapshot(doc(db, 'users', userDocId), (userSnap) => {
          if (userSnap.exists()) {
            setUserData({ id: userSnap.id, ...userSnap.data() } as UserData);
            setLoading(false);
          }
        });
      } else {
        setUserData(null);
        setLoading(false);
        if (unsubscribeDoc) unsubscribeDoc();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading, loginWithEmail, signupWithEmail, resetPassword, claimAccount }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
