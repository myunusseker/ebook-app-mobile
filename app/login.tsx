import { useAuth } from '@/context/AuthContext';
import { auth } from '@/firebaseConfig';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { createOrUpdateUserProfile } from '@/utils/userProfile';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { request, promptAsync, response } = useGoogleAuth();

  // Redirect logged-in users to home
  useEffect(() => {
    if (user) {
      router.replace('/(tabs)');
    }
  }, [user]);

  // Optional: fallback if response handling fails inside the hook
  useEffect(() => {
    if (response?.type === 'error') {
      console.warn('Google Auth Error:', response.error);
    }
  }, [response]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      await createOrUpdateUserProfile(auth.currentUser);
      setError('');
    } catch (err) {
      setError('Invalid email or password');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      {error ? <Text style={{ color: 'red', marginBottom: 10 }}>{error}</Text> : null}

      <TouchableOpacity onPress={handleLogin} style={styles.loginButton} disabled={loading}>
        <Text style={styles.loginText}>{loading ? 'Logging in...' : 'Login'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/signup')}>
        <Text style={styles.linkText}>
          Don’t have an account? <Text style={styles.bold}>Sign up now!</Text>
        </Text>
      </TouchableOpacity>

      <Text style={styles.or}>OR</Text>

      <TouchableOpacity
        style={styles.googleButton}
        onPress={() => {
          if (request) {
            promptAsync();
          } else {
            console.warn('Google Auth request not ready yet');
          }
        }}
        disabled={!request}
      >
        <View style={styles.googleButtonContent}>
          <FontAwesome name="google" size={20} color="#007AFF" style={{ marginRight: 8 }} />
          <Text style={styles.googleText}>Continue with Google</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: Platform.OS === 'ios' ? 14 : 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  loginButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  loginText: {
    color: '#fff',
    fontWeight: '600',
  },
  linkText: {
    textAlign: 'center',
    color: '#555',
    marginBottom: 16,
  },
  bold: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  or: {
    textAlign: 'center',
    color: '#aaa',
    marginVertical: 10,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButton: {
    backgroundColor: '#eee',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  googleText: {
    color: '#444',
    fontWeight: '500',
  },
});
