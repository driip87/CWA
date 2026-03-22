import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app } from './firebase';

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

function getAppStorage() {
  return getStorage(app);
}

export function getUserProfileImagePath(uid: string) {
  return `users/${uid}/profile/avatar`;
}

export function validateProfileImage(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Profile photos must be 5 MB or smaller.');
  }
}

export async function uploadUserProfileImage(uid: string, file: File) {
  validateProfileImage(file);
  const path = getUserProfileImagePath(uid);
  const imageRef = ref(getAppStorage(), path);
  await uploadBytes(imageRef, file, {
    contentType: file.type,
    cacheControl: 'no-store,max-age=0',
  });
  const url = await getDownloadURL(imageRef);
  return { path, url };
}

export async function deleteUserProfileImage(path: string) {
  const imageRef = ref(getAppStorage(), path);
  await deleteObject(imageRef);
}

export async function getUserProfileImageUrl(uid: string) {
  try {
    return await getDownloadURL(ref(getAppStorage(), getUserProfileImagePath(uid)));
  } catch (error: any) {
    if (error?.code === 'storage/object-not-found' || error?.code === 'storage/unauthorized') {
      return null;
    }
    throw error;
  }
}
