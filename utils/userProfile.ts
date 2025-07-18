// firebase/userProfile.ts
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig'; // make sure Firestore is initialized

export interface UserProfile {
  name?: string;
  email: string;
  photoURL?: string;
  createdAt: string;
  voiceStatus?: 'ready' | 'not_ready';
  voiceRecordingURL?: string;
  voiceRecordedAt?: string;
}

export async function createOrUpdateUserProfile(user: User) {
  if (!user) return;

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      createdAt: new Date().toISOString(),
    });
  }
}
