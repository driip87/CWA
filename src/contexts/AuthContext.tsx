import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface UserData {
  uid: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  phone?: string;
  address?: string;
  createdAt: string;
  subscriptionStatus?: 'active' | 'inactive';
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userData: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        
        unsubscribeDoc = onSnapshot(userRef, async (userSnap) => {
          if (userSnap.exists()) {
            setUserData(userSnap.data() as UserData);
            setLoading(false);
          } else {
            const isAdmin = currentUser.email === 'kereeonmiller@gmail.com';
            const newUserData: UserData = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              name: currentUser.displayName || '',
              role: isAdmin ? 'admin' : 'user',
              createdAt: new Date().toISOString(),
              subscriptionStatus: isAdmin ? 'active' : 'inactive',
            };
            await setDoc(userRef, newUserData);
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
    <AuthContext.Provider value={{ user, userData, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
