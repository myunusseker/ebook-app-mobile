import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/firebaseConfig';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const SAMPLE_SENTENCE = "The quick brown fox jumps over the lazy dog. This sentence contains various sounds that help create a voice profile.";

export default function VoiceSetupScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>('idle');
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const progressAnim = new Animated.Value(0);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission denied', 'We need microphone permission to record your voice.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setRecordingStatus('recording');
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setRecordingStatus('stopping');
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setAudioUri(uri);
    setRecording(null);
    setRecordingStatus('stopped');
  };

  const playRecording = async () => {
    if (!audioUri) return;

    try {
      setIsLoadingAudio(true);
      
      // Set audio mode first
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync({ uri: audioUri });
      setSound(newSound);
      
      // Get duration
      const status = await newSound.getStatusAsync();
      if (status.isLoaded) {
        setDuration(status.durationMillis || 0);
      }
      
      // Set up playback status listener
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setPosition(status.positionMillis || 0);
          setIsPlaying(status.isPlaying);
          
          // Update progress animation
          const progress = status.durationMillis ? (status.positionMillis || 0) / status.durationMillis : 0;
          Animated.timing(progressAnim, {
            toValue: progress,
            duration: 100,
            useNativeDriver: false,
          }).start();
          
          // Reset when finished
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPosition(0);
            progressAnim.setValue(0);
            newSound.setPositionAsync(0);
          }
        }
      });
      
      await newSound.playAsync();
    } catch (error) {
      console.error('Error playing sound:', error);
      setIsPlaying(false);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const playPauseAudio = async () => {
    if (!sound) {
      await playRecording();
      return;
    }
    
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        if (isPlaying) {
          await sound.pauseAsync();
        } else {
          // If audio finished, reset to beginning
          if (status.didJustFinish || status.positionMillis === status.durationMillis) {
            await sound.setPositionAsync(0);
            setPosition(0);
            progressAnim.setValue(0);
          }
          await sound.playAsync();
        }
      }
    } catch (error) {
      console.error('Error playing/pausing audio:', error);
      await playRecording();
    }
  };

  const resetAudio = async () => {
    if (sound) {
      await sound.setPositionAsync(0);
      setPosition(0);
      progressAnim.setValue(0);
    }
  };

  const stopPlaying = async () => {
    if (sound) {
      await sound.stopAsync();
      setIsPlaying(false);
    }
  };

  const uploadAndSaveVoice = async () => {
    if (!audioUri || !user) return;

    setIsUploading(true);
    try {
      // Convert the audio file to blob
      const response = await fetch(audioUri);
      const blob = await response.blob();

      // Create a reference to Firebase Storage
      const audioRef = ref(storage, `voices/${user.uid}/voice-sample.m4a`);

      // Upload the file
      await uploadBytes(audioRef, blob);

      // Get the download URL
      const downloadURL = await getDownloadURL(audioRef);

      // Update user profile in Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        voiceStatus: 'ready',
        voiceRecordingURL: downloadURL,
        voiceRecordedAt: new Date().toISOString(),
      });

      Alert.alert(
        'Success!',
        'Your voice sample has been saved successfully!',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error uploading voice:', error);
      Alert.alert('Error', 'Failed to save your voice sample. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const resetRecording = () => {
    setAudioUri(null);
    setRecordingStatus('idle');
    if (sound) {
      sound.unloadAsync();
      setSound(null);
    }
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
    progressAnim.setValue(0);
  };

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Setup AI Voice</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.instruction}>
          Please read the following sentence clearly and naturally:
        </Text>
        
        <View style={styles.sentenceContainer}>
          <Text style={styles.sentence}>{SAMPLE_SENTENCE}</Text>
        </View>

        <View style={styles.recordingSection}>
          {recordingStatus === 'idle' && (
            <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
              <Feather name="mic" size={32} color="#fff" />
              <Text style={styles.recordButtonText}>Start Recording</Text>
            </TouchableOpacity>
          )}

          {recordingStatus === 'recording' && (
            <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
              <Feather name="square" size={32} color="#fff" />
              <Text style={styles.stopButtonText}>Stop Recording</Text>
            </TouchableOpacity>
          )}

          {recordingStatus === 'stopping' && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.processingText}>Processing...</Text>
            </View>
          )}

          {recordingStatus === 'stopped' && audioUri && (
            <View style={styles.playbackSection}>
              <Text style={styles.playbackTitle}>Your Recording:</Text>
              
              {/* Enhanced Audio Player */}
              <View style={styles.audioPlayerContainer}>
                <View style={styles.audioPlayer}>
                  <TouchableOpacity 
                    style={[
                      styles.audioPlayButton, 
                      { 
                        borderColor: isPlaying ? '#007AFF' : '#e0e0e0',
                        backgroundColor: isPlaying ? '#f0f8ff' : '#fff'
                      }
                    ]} 
                    onPress={playPauseAudio}
                    disabled={isLoadingAudio}
                  >
                    {isLoadingAudio ? (
                      <Feather name="loader" size={20} color="#007AFF" />
                    ) : (
                      <Feather name={isPlaying ? "pause" : "play"} size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                  
                  <View style={styles.progressContainer}>
                    <TouchableOpacity 
                      style={styles.progressBar}
                      onPress={resetAudio}
                      activeOpacity={0.7}
                    >
                      <Animated.View 
                        style={[
                          styles.progressFill,
                          {
                            width: progressAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', '100%'],
                            }),
                          },
                        ]}
                      />
                    </TouchableOpacity>
                    <View style={styles.timeContainer}>
                      <Text style={styles.timeText}>{formatTime(position)}</Text>
                      <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.playbackControls}>
                <TouchableOpacity style={styles.reRecordButton} onPress={resetRecording}>
                  <Feather name="rotate-ccw" size={20} color="#666" />
                  <Text style={styles.reRecordButtonText}>Re-record</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, isUploading && styles.disabledButton]}
                onPress={uploadAndSaveVoice}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="check" size={20} color="#fff" />
                )}
                <Text style={styles.saveButtonText}>
                  {isUploading ? 'Saving...' : 'Save Voice'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  instruction: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  sentenceContainer: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
    marginBottom: 40,
  },
  sentence: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    textAlign: 'center',
  },
  recordingSection: {
    alignItems: 'center',
  },
  recordButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 50,
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  stopButton: {
    backgroundColor: '#34495e',
    borderRadius: 50,
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  processingContainer: {
    alignItems: 'center',
    marginVertical: 40,
  },
  processingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  playbackSection: {
    alignItems: 'center',
    width: '100%',
  },
  playbackTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  playbackControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 30,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  playButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  reRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  reRecordButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27ae60',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 8,
    width: '100%',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  audioPlayerContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    width: '100%',
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  audioPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  progressContainer: {
    flex: 1,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});
