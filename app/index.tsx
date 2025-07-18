import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth(); // 👈 use global auth state

  useEffect(() => {
    if (loading) return;

    if (user) {
      router.replace('/(tabs)');
    } else {
      router.replace('/login');
    }
  }, [user, loading]); // 👈 rerun when user changes

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#000" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
