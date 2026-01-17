import { useState, useRef, useCallback } from 'react';

interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
}

export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      
      streamRef.current = stream;
      chunksRef.current = [];
      
      // Prefer webm/opus for better compression, fallback to other formats
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : 'audio/wav';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setState(prev => ({ ...prev, audioBlob: blob }));
      };
      
      mediaRecorder.start(100); // Collect data every 100ms
      
      setState({
        isRecording: true,
        isPaused: false,
        duration: 0,
        audioBlob: null,
      });
      
      // Start timer
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      setState(prev => ({ ...prev, isRecording: false, isPaused: false }));
    }
  }, [state.isRecording]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      chunksRef.current = [];
      
      setState({
        isRecording: false,
        isPaused: false,
        duration: 0,
        audioBlob: null,
      });
    }
  }, []);

  const clearAudio = useCallback(() => {
    setState(prev => ({ ...prev, audioBlob: null, duration: 0 }));
    chunksRef.current = [];
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    clearAudio,
    formatDuration,
  };
}
