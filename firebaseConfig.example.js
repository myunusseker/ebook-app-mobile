import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// Copy this file to firebaseConfig.js and replace with your actual Firebase config
const firebaseConfig = {
  apiKey: 'your-api-key-here',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project-id',
  storageBucket: 'your-project.firebasestorage.app',
  messagingSenderId: 'your-sender-id',
  appId: 'your-app-id',
  measurementId: 'your-measurement-id',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let auth;

if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export { auth, db, storage };

