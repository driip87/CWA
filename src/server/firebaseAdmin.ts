import dotenv from 'dotenv';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

function readPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return null;
  return raw.replace(/\\n/g, '\n');
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  if (projectId) {
    process.env.GOOGLE_CLOUD_PROJECT ||= projectId;
    process.env.GCLOUD_PROJECT ||= projectId;
  }
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = readPrivateKey();

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      projectId,
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return initializeApp({
    projectId,
    credential: applicationDefault(),
  });
}

const adminApp = initializeFirebaseAdmin();
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp, firestoreDatabaseId);
