import { auth, db } from '@/firebaseConfig';
import { UserProfile } from '@/utils/userProfile';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export const useUserProfile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      }
      setLoading(false);
    };

    fetchProfile();
  }, []);

  return { profile, loading };
};
