// hooks/useGoogleAuth.ts
import { auth } from '@/firebaseConfig';
import { createOrUpdateUserProfile } from '@/utils/userProfile';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { router } from 'expo-router';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useEffect } from 'react';

export function useGoogleAuth() {
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'com.anonymous.ebookappmobile',
  });

  const [
    request,
    response,
    promptAsync
  ] = Google.useAuthRequest({
    androidClientId: '614458993938-d11gh554l6qr00e46otnftkh8fhmno9q.apps.googleusercontent.com',
    iosClientId: '614458993938-53glinlcnjg5s5bbk0rravd64jaam5lo.apps.googleusercontent.com',
    webClientId: '614458993938-juinuuvf980tmbffpfdq2uihb1u9dn0f.apps.googleusercontent.com',
    redirectUri,
    scopes: ['profile', 'email'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      (async () => {
        const { id_token } = response.params;
        if (!id_token) return console.warn('No ID token');
        const credential = GoogleAuthProvider.credential(id_token);
        const result = await signInWithCredential(auth, credential);
        await createOrUpdateUserProfile(result.user);
        router.replace('/(tabs)');
      })();
    }
  }, [response]);

  return { request, promptAsync };
}
