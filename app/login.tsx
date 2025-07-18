import { useAuth } from '@/context/AuthContext';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { createOrUpdateUserProfile } from '@/utils/userProfile';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

const { width, height } = Dimensions.get('window');

// InputField component
const InputField = ({ 
  icon, 
  placeholder, 
  value, 
  onChangeText, 
  keyboardType = 'default', 
  secureTextEntry = false, 
  autoCapitalize = 'none',
  error
}: any) => {
  const [showPassword, setShowPassword] = useState(false);
  
  return (
    <View style={styles.inputContainer}>
      <View style={[styles.inputWrapper, { borderColor: error ? '#FF3B30' : '#e5e5ea' }]}>
        <Ionicons name={icon} size={20} color={error ? '#FF3B30' : '#666'} style={styles.inputIcon} />
        <TextInput
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry && !showPassword}
          autoCapitalize={autoCapitalize}
          style={styles.input}
          placeholderTextColor="#666"
          autoCorrect={false}
          autoComplete="off"
        />
        {secureTextEntry && (
          <TouchableOpacity 
            onPress={() => setShowPassword(!showPassword)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons 
              name={showPassword ? 'eye-off' : 'eye'} 
              size={20} 
              color="#666" 
            />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

export default function LoginScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; name?: string }>({});

  const { request, promptAsync } = useGoogleAuth();

  // Redirect logged-in users to home
  useEffect(() => {
    if (user) {
      router.replace('/(tabs)');
    }
  }, [user]);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string; confirmPassword?: string; name?: string } = {};
    
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!password || password.trim().length === 0) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    if (isSignUp && !name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (isSignUp && (!confirmPassword || confirmPassword.trim().length === 0)) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (isSignUp && password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAuth = async () => {
    if (!validateForm()) return;
    
    // Clear any previous errors when form is valid
    setErrors({});
    setLoading(true);
    
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth as Auth, email.trim(), password);
        const user = userCredential.user;
        
        // Create proper user profile using the existing utility
        await createOrUpdateUserProfile(user);
        
        // Optionally update the name if provided
        if (name.trim()) {
          await setDoc(doc(db, 'users', user.uid), {
            name: name.trim(),
          }, { merge: true });
        }
      } else {
        await signInWithEmailAndPassword(auth as Auth, email.trim(), password);
        if ((auth as Auth).currentUser) {
          await createOrUpdateUserProfile((auth as Auth).currentUser!);
        }
      }
      router.replace('/(tabs)');
    } catch (error: any) {
      let errorMessage = 'An error occurred';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      }
      Alert.alert(isSignUp ? 'Sign Up Failed' : 'Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Stable callbacks to prevent re-renders
  const handleNameChange = useCallback((text: string) => setName(text), []);
  const handleEmailChange = useCallback((text: string) => setEmail(text), []);
  const handlePasswordChange = useCallback((text: string) => setPassword(text), []);
  const handleConfirmPasswordChange = useCallback((text: string) => setConfirmPassword(text), []);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="book" size={48} color="#007AFF" />
            </View>
            <Text style={styles.title}>
              E-Book App
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp ? 'Create your account to start reading' : 'Welcome back! Please login to your account'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {isSignUp && (
              <InputField
                icon="person-outline"
                placeholder="Full Name"
                value={name}
                onChangeText={handleNameChange}
                autoCapitalize="words"
                error={errors.name}
              />
            )}
            
            <InputField
              icon="mail-outline"
              placeholder="Email Address"
              value={email}
              onChangeText={handleEmailChange}
              keyboardType="email-address"
              error={errors.email}
            />
            
            <InputField
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={true}
              error={errors.password}
            />
            
            {isSignUp && (
              <InputField
                icon="lock-closed-outline"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                secureTextEntry={true}
                error={errors.confirmPassword}
              />
            )}

            {/* Auth Button */}
            <TouchableOpacity 
              style={[styles.button, { opacity: loading ? 0.7 : 1 }]}
              onPress={handleAuth}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Login')}
              </Text>
            </TouchableOpacity>

            {/* Google Auth */}
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

            {/* Toggle Sign Up / Login */}
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleText}>
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              </Text>
              <TouchableOpacity onPress={() => {
                setIsSignUp(!isSignUp);
                setErrors({});
                setName('');
                setEmail('');
                setPassword('');
                setConfirmPassword('');
              }}>
                <Text style={styles.toggleButton}>
                  {isSignUp ? 'Login' : 'Sign Up'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to our Terms of Service and Privacy Policy
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 0,
    paddingBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    color: '#1d1d1f',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
    color: '#666',
  },
  form: {
    width: '85%',
    paddingBottom: 0,
    alignSelf: 'center',
  },
  inputContainer: {
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1d1d1f',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginTop: 8,
    marginLeft: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  or: {
    textAlign: 'center',
    color: '#aaa',
    marginVertical: 20,
    fontSize: 16,
  },
  googleButton: {
    backgroundColor: '#fff',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleText: {
    color: '#444',
    fontSize: 16,
    fontWeight: '500',
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  toggleText: {
    fontSize: 16,
    marginRight: 8,
    color: '#666',
  },
  toggleButton: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    marginTop: 40,
  },
  footerText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    color: '#666',
  },
});
