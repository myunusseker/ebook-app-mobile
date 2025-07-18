import { useAuth } from '@/context/AuthContext';
import { auth, db, storage } from '@/firebaseConfig';
import { UserProfile } from '@/utils/userProfile';
import { Feather } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Auth, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { width, height } = Dimensions.get('window');
const placeholderImage = 'https://www.gravatar.com/avatar/?d=mp';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation();
  const router = useRouter();
  
  // Audio player state
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  // Setup Audio
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        console.error('Error setting up Audio:', error);
      }
    };

    setupAudio();
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const fetchProfile = async () => {
        const ref = doc(db, 'users', user.uid);
        const snap = await getDoc(ref);
        if (snap.exists() && isActive) {
          const newProfile = snap.data() as UserProfile;
          
          // Reset audio
          if (sound) {
            await sound.unloadAsync();
            setSound(null);
          }
          setIsPlaying(false);
          setPosition(0);
          setDuration(0);
          
          setProfile(newProfile);
          
          // Load audio if voice recording exists
          if (newProfile.voiceRecordingURL) {
            await loadAudio(newProfile.voiceRecordingURL);
          }
        }
      };

      if (user) fetchProfile();

      return () => {
        isActive = false;
      };
    }, [user])
  );

  // Clean up audio when component unmounts
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const loadAudio = async (voiceURL?: string) => {
    const audioURL = voiceURL || profile?.voiceRecordingURL;
    if (!audioURL) return;
    
    try {
      setIsLoading(true);
      
      // Unload previous audio if exists
      if (sound) {
        await sound.unloadAsync();
      }
      
      // Load new audio
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioURL },
        { shouldPlay: false },
        (status) => {
          if (status.isLoaded) {
            setDuration(status.durationMillis || 0);
            setPosition(status.positionMillis || 0);
            setIsPlaying(status.isPlaying);
          }
        }
      );
      
      setSound(newSound);
      
    } catch (error) {
      console.error('Error loading audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const playPauseAudio = async () => {
    try {
      if (!sound) {
        await loadAudio();
        return;
      }
      
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch (error) {
      console.error('Error playing/pausing audio:', error);
    }
  };

  const resetAudio = async () => {
    try {
      if (sound) {
        await sound.setPositionAsync(0);
      }
    } catch (error) {
      console.error('Error resetting audio:', error);
    }
  };

  const seekAudio = async (value: number) => {
    try {
      if (sound) {
        await sound.setPositionAsync(value * 1000); // Convert to milliseconds
      }
    } catch (error) {
      console.error('Error seeking audio:', error);
    }
  };

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDeleteVoice = async () => {
    Alert.alert('Delete Voice?', 'This will remove your AI voice data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // Stop and unload audio
            if (sound) {
              await sound.unloadAsync();
              setSound(null);
            }
            setIsPlaying(false);
            setPosition(0);
            setDuration(0);

            // Delete from Firebase Storage
            const voiceRef = ref(storage, `voices/${user.uid}/voice-sample.m4a`);
            await deleteObject(voiceRef);

            // Update user profile in Firestore
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              voiceStatus: 'not_ready',
              voiceRecordingURL: null,
              voiceRecordedAt: null,
            });

            // Update local state
            setProfile(prev => prev ? { ...prev, voiceStatus: 'not_ready' } : null);
            
            Alert.alert('Success', 'Your AI voice has been deleted.');
          } catch (error) {
            console.error('Error deleting voice:', error);
            Alert.alert('Error', 'Failed to delete voice. Please try again.');
          }
        },
      },
    ]);
  };

  const handleRecalibrate = async () => {
    // Clean up audio before navigating
    if (sound) {
      await sound.unloadAsync();
      setSound(null);
    }
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
    
    router.push('/voice-setup');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth as Auth);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handlePhotoPress = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need access to your photo library to change your profile picture.');
        return;
      }

      // Show options to user
      Alert.alert(
        'Select Photo',
        'Choose how you want to select your profile picture',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Choose from Library', onPress: () => pickImageFromLibrary() },
          { text: 'Take Photo', onPress: () => takePhoto() },
        ]
      );
    } catch (error) {
      console.error('Error in handlePhotoPress:', error);
      Alert.alert('Error', 'Failed to access photo library. Please try again.');
    }
  };

  const pickImageFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image from library:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need camera access to take a photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const uploadPhoto = async (uri: string) => {
    if (!user) return;

    try {
      setIsUploadingPhoto(true);
      
      // Process the image before upload
      const processedUri = await processImage(uri);
      
      // Create a blob from the processed image URI
      const response = await fetch(processedUri);
      const blob = await response.blob();
      
      // Create a reference to the storage location
      const photoRef = ref(storage, `profilePhotos/${user.uid}/photo.jpg`);
      
      // Upload the image
      await uploadBytes(photoRef, blob);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(photoRef);
      
      // Update the user's profile in Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        photoURL: downloadURL,
      });
      
      // Update local state
      setProfile(prev => prev ? { ...prev, photoURL: downloadURL } : null);
      
      Alert.alert('Success', 'Profile photo updated successfully!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to update profile photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const processImage = async (uri: string): Promise<string> => {
    try {
      // For now, we'll return the original URI
      // The image will be uploaded as-is without additional processing
      return uri;
    } catch (error) {
      console.error('Error processing image:', error);
      return uri;
    }
  };

  const handleNameEdit = () => {
    setEditedName(profile?.name || '');
    setIsEditingName(true);
  };

  const handleNameSave = async () => {
    if (!user || !editedName.trim()) {
      Alert.alert('Error', 'Please enter a valid name.');
      return;
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: editedName.trim(),
      });
      
      setProfile(prev => prev ? { ...prev, name: editedName.trim() } : null);
      setIsEditingName(false);
      
      Alert.alert('Success', 'Name updated successfully!');
    } catch (error) {
      console.error('Error updating name:', error);
      Alert.alert('Error', 'Failed to update name. Please try again.');
    }
  };

  const handleNameCancel = () => {
    setIsEditingName(false);
    setEditedName('');
  };

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar backgroundColor="#6C5CE7" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
      </View>

      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <TouchableOpacity 
          style={styles.avatarContainer} 
          onPress={handlePhotoPress}
          disabled={isUploadingPhoto}
        >
          <Image source={{ uri: profile.photoURL || placeholderImage }} style={styles.avatar} />
          <View style={styles.avatarOverlay}>
            {isUploadingPhoto ? (
              <Feather name="loader" size={16} color="#fff" />
            ) : (
              <Feather name="camera" size={16} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
        
        <View style={styles.nameContainer}>
          {isEditingName ? (
            <View style={styles.nameEditContainer}>
              <TextInput
                style={styles.nameInput}
                value={editedName}
                onChangeText={setEditedName}
                placeholder="Enter your name"
                autoFocus
                maxLength={50}
              />
              <View style={styles.nameEditActions}>
                <TouchableOpacity style={styles.nameEditButton} onPress={handleNameSave}>
                  <Feather name="check" size={16} color="#6C5CE7" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.nameEditButton} onPress={handleNameCancel}>
                  <Feather name="x" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.nameDisplayContainer}>
              <Text style={styles.userName}>{profile.name || 'Your Name'}</Text>
              <TouchableOpacity onPress={handleNameEdit}>
                <Feather name="edit-2" size={16} color="#6C5CE7" />
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        <Text style={styles.userEmail}>{profile.email}</Text>
        <View style={styles.membershipBadge}>
          <Text style={styles.membershipText}>Premium Member</Text>
        </View>
      </View>

      {/* Voice Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="mic" size={18} color="#6C5CE7" />
          <Text style={styles.sectionTitle}>AI Voice</Text>
        </View>
        
        {profile.voiceStatus === 'ready' ? (
          <View style={styles.voiceSection}>
            {profile.voiceRecordingURL && (
              <View style={styles.audioPlayerSection}>
                <View style={styles.audioPlayerHeader}>
                  <Text style={styles.audioPlayerTitle}>Your Voice Sample</Text>
                  <TouchableOpacity 
                    onPress={() => loadAudio(profile.voiceRecordingURL)}
                    style={styles.refreshButton}
                  >
                    <Feather name="refresh-cw" size={14} color="#6C5CE7" />
                  </TouchableOpacity>
                </View>
                {profile.voiceRecordedAt && (
                  <Text style={styles.audioPlayerSubtitle}>
                    Recorded: {new Date(profile.voiceRecordedAt).toLocaleDateString()}
                  </Text>
                )}
                
                <View style={styles.audioPlayer}>
                  <TouchableOpacity 
                    style={[
                      styles.playButton, 
                      { 
                        backgroundColor: isPlaying ? '#6C5CE7' : '#f5f5f5',
                      }
                    ]} 
                    onPress={playPauseAudio}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Feather name="loader" size={20} color="#6C5CE7" />
                    ) : (
                      <Feather name={isPlaying ? "pause" : "play"} size={20} color={isPlaying ? "#fff" : "#6C5CE7"} />
                    )}
                  </TouchableOpacity>
                  
                  <View style={styles.progressContainer}>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={duration / 1000}
                      value={position / 1000}
                      onSlidingComplete={async (value) => {
                        await seekAudio(value);
                      }}
                      minimumTrackTintColor="#6C5CE7"
                      maximumTrackTintColor="#e0e0e0"
                      thumbTintColor="#6C5CE7"
                    />
                    <View style={styles.timeContainer}>
                      <Text style={styles.timeText}>{formatTime(position)}</Text>
                      <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
            
            <View style={styles.voiceActions}>
              <TouchableOpacity style={styles.actionButton} onPress={handleRecalibrate}>
                <Feather name="refresh-cw" size={16} color="#6C5CE7" />
                <Text style={styles.actionButtonText}>Recalibrate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButtonDanger} onPress={handleDeleteVoice}>
                <Feather name="trash-2" size={16} color="#FF3B30" />
                <Text style={styles.actionButtonTextDanger}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.setupButton} onPress={() => router.push('/voice-setup')}>
            <Feather name="mic" size={18} color="#fff" />
            <Text style={styles.setupButtonText}>Set Up AI Voice</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="user" size={18} color="#6C5CE7" />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>
        
        <View style={styles.accountInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member since</Text>
            <Text style={styles.infoValue}>
              {new Date(profile.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>Active</Text>
          </View>
        </View>
      </View>

      {/* Settings Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="settings" size={18} color="#6C5CE7" />
          <Text style={styles.sectionTitle}>Settings</Text>
        </View>
        
        <View style={styles.settingsMenu}>
          <TouchableOpacity style={styles.menuItem}>
            <Feather name="bell" size={16} color="#666" />
            <Text style={styles.menuItemText}>Notifications</Text>
            <Feather name="chevron-right" size={16} color="#ccc" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <Feather name="shield" size={16} color="#666" />
            <Text style={styles.menuItemText}>Privacy</Text>
            <Feather name="chevron-right" size={16} color="#ccc" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <Feather name="help-circle" size={16} color="#666" />
            <Text style={styles.menuItemText}>Help & Support</Text>
            <Feather name="chevron-right" size={16} color="#ccc" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Logout */}
      <View style={styles.logoutSection}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Feather name="log-out" size={18} color="#FF3B30" />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    paddingBottom: 150, // Extra padding for comfortable scrolling
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#6C5CE7',
    marginTop: -500,
    paddingTop: Platform.OS === 'ios' ? 550 : 520,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  nameContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameEditContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#6C5CE7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 200,
  },
  nameEditActions: {
    flexDirection: 'row',
    gap: 16,
  },
  nameEditButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  membershipBadge: {
    backgroundColor: '#6C5CE7',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  membershipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 24,
    marginVertical: 8,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginLeft: 8,
  },
  voiceSection: {
    marginTop: 4,
  },
  audioPlayerSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  audioPlayerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  audioPlayerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  refreshButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  audioPlayerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6C5CE7',
  },
  progressContainer: {
    flex: 1,
  },
  slider: {
    width: '100%',
    height: 20,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#666',
  },
  voiceActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  actionButtonDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF3B30',
    gap: 8,
  },
  actionButtonTextDanger: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
  },
  setupButton: {
    backgroundColor: '#6C5CE7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  accountInfo: {
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  settingsMenu: {
    marginTop: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  logoutSection: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
