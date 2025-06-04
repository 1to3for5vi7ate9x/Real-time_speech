'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import VideoPlayer from '../components/VideoPlayer';
import TranscriptionDisplay from '../components/TranscriptionDisplay';
import TranslationDisplay from '../components/TranslationDisplay';
import { LanguageSelector } from '../components/LanguageSelector';
import { AudioVisualizer } from '../components/AudioVisualizer';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { useTranslation } from '../hooks/useTranslation';
import { useTTS } from '../hooks/useTTS';

// Types
interface CartesiaVoice {
  id: string;
  name: string;
  language: string;
  description?: string;
  gender?: string;
}

const targetLanguages = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ja', name: 'Japanese' },
  { code: 'de', name: 'German' },
];

export default function Home() {
  // State Management
  const [selectedLanguage, setSelectedLanguage] = useState(targetLanguages[0].code);
  const [cartesiaVoices, setCartesiaVoices] = useState<CartesiaVoice[] | null>(null);
  const [isVoicesLoading, setIsVoicesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [dubbedAudioBuffer, setDubbedAudioBuffer] = useState<AudioBuffer | null>(null);
  const [finalizedTranscript, setFinalizedTranscript] = useState('');
  const [currentPartial, setCurrentPartial] = useState('');
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);

  // Refs
  const fullVideoTranscriptRef = useRef('');
  const isProcessingVideoASRRef = useRef(false);
  const expectingVideoSessionTerminationRef = useRef(false);
  const lastCompletedTranslationRef = useRef<{ text: string; language: string }>({ text: '', language: '' });
  const selectedLanguageRef = useRef(selectedLanguage);
  const cartesiaVoicesRef = useRef<CartesiaVoice[] | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Custom Hooks
  const { translatedText, isTranslating, translateText, clearTranslation } = useTranslation();
  const { ttsAudioLevel, isPlayingTTS, playTTS, playTTSForVideo } = useTTS();

  // Create refs for all state that needs to be accessed in callbacks
  const selectedVideoFileRef = useRef<File | null>(null);
  useEffect(() => {
    selectedVideoFileRef.current = selectedVideoFile;
  }, [selectedVideoFile]);

  const handleSessionTerminated = useCallback(() => {
    console.log('[SESSION_TERMINATED] Handler called. Expecting:', expectingVideoSessionTerminationRef.current, 'Video:', selectedVideoFileRef.current);
    
    if (expectingVideoSessionTerminationRef.current && selectedVideoFileRef.current) {
      expectingVideoSessionTerminationRef.current = false;
      isProcessingVideoASRRef.current = false;
      setIsProcessingVideo(false);
      
      const completeVideoTranscript = fullVideoTranscriptRef.current.trim();
      console.log('[SESSION_TERMINATED] Complete transcript length:', completeVideoTranscript.length);
      
      if (completeVideoTranscript) {
        handleFinalVideoTranscript(completeVideoTranscript, selectedLanguageRef.current);
      } else {
        setError('No speech detected in the video. Please ensure your video contains clear audio.');
      }
      fullVideoTranscriptRef.current = '';
    }
  }, []);

  // WebSocket handlers
  const handleTranscript = useCallback((transcript: any) => {
    if (transcript.message_type === "PartialTranscript") {
      setCurrentPartial(transcript.text);
      if (!selectedVideoFileRef.current && !isProcessingVideoASRRef.current && transcript.text.trim().length >= 5) {
        // For live mic input, translate partials
        translateText(transcript.text, selectedLanguageRef.current).catch(console.error);
      }
    } else if (transcript.message_type === "FinalTranscript" && transcript.text) {
      const newFinalText = transcript.text;
      setFinalizedTranscript(prev => prev + newFinalText + ' ');
      setCurrentPartial('');

      if (isProcessingVideoASRRef.current && selectedVideoFileRef.current) {
        fullVideoTranscriptRef.current += newFinalText + ' ';
        console.log('[TRANSCRIPT] Added to video transcript:', newFinalText);
        console.log('[TRANSCRIPT] Total video transcript length so far:', fullVideoTranscriptRef.current.length);
      } else if (!selectedVideoFileRef.current) {
        // For mic input, translate and play TTS
        translateText(newFinalText, selectedLanguageRef.current)
          .then(translated => {
            if (translated) {
              lastCompletedTranslationRef.current = { text: translated, language: selectedLanguageRef.current };
            }
          })
          .catch(console.error);
      }
    } else if (transcript.message_type === 'SessionTerminated') {
      console.log('[TRANSCRIPT] Received SessionTerminated message');
      handleSessionTerminated();
    }
  }, [translateText, handleSessionTerminated]);

  const handleWebSocketError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    if (isProcessingVideoASRRef.current) {
      isProcessingVideoASRRef.current = false;
      expectingVideoSessionTerminationRef.current = false;
      setIsProcessingVideo(false);
    }
  }, []);

  const { isConnected, isSessionReady, sendData, endStream } = useWebSocket({
    onTranscript: handleTranscript,
    onSessionTerminated: handleSessionTerminated,
    onError: handleWebSocketError,
  });

  const { isRecording, audioLevel, startRecording: startMicRecording, stopRecording: stopMicRecording } = useAudioRecording({
    onAudioData: sendData,
  });

  // Fetch Cartesia Voices
  useEffect(() => {
    const fetchVoices = async () => {
      setIsVoicesLoading(true);
      try {
        const response = await fetch('/api/voices');
        if (!response.ok) {
          throw new Error(`Failed to fetch voices: ${response.statusText}`);
        }
        const data = await response.json();
        const voices = Array.isArray(data) ? data : (data.voices || []);
        setCartesiaVoices(voices);
        cartesiaVoicesRef.current = voices;
      } catch (err) {
        console.error('Error fetching Cartesia voices:', err);
        setError(`Failed to load TTS voices: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsVoicesLoading(false);
      }
    };

    fetchVoices();
  }, []);

  // Update refs when state changes
  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  useEffect(() => {
    cartesiaVoicesRef.current = cartesiaVoices;
  }, [cartesiaVoices]);

  // Create a ref to track session ready state
  const isSessionReadyRef = useRef(isSessionReady);
  useEffect(() => {
    isSessionReadyRef.current = isSessionReady;
  }, [isSessionReady]);

  // Video processing
  const processUploadedVideoAudio = async (videoFile: File) => {
    if (!isConnected) {
      setError('WebSocket is not connected. Cannot process video.');
      return;
    }
    if (isProcessingVideoASRRef.current) {
      return;
    }

    isProcessingVideoASRRef.current = true;
    setIsProcessingVideo(true);
    setError(null);
    fullVideoTranscriptRef.current = '';
    setFinalizedTranscript('');
    setCurrentPartial('');
    clearTranslation();
    setDubbedAudioBuffer(null);

    try {
      console.log('[VIDEO_PROC] Starting video processing for:', videoFile.name);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } else if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const arrayBuffer = await videoFile.arrayBuffer();
      console.log('[VIDEO_PROC] Video file loaded, size:', arrayBuffer.byteLength);
      
      let decodedAudioBuffer;
      try {
        // Try to decode as audio directly (works for some formats)
        decodedAudioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
      } catch (decodeError) {
        console.log('[VIDEO_PROC] Direct audio decode failed, trying alternative approach');
        
        // For video files, we need proper audio extraction
        // This is a limitation of the Web Audio API with video containers
        throw new Error('This video format requires server-side audio extraction. Please try a different video or ensure it has a compatible audio track (MP4 with AAC audio works best).');
      }
      
      console.log('[VIDEO_PROC] Audio decoded. Sample rate:', decodedAudioBuffer.sampleRate, 'Duration:', decodedAudioBuffer.duration);
      
      const rawPcmData = decodedAudioBuffer.getChannelData(0);
      const sourceSampleRate = decodedAudioBuffer.sampleRate;
      const targetSampleRate = 16000;
      const resampleRatio = sourceSampleRate / targetSampleRate;
      const desiredOutputLength = Math.floor(targetSampleRate * 0.250);
      
      let resampleBuffer = new Float32Array(rawPcmData);
      let chunksSent = 0;

      // Wait for session to be ready
      console.log('[VIDEO_PROC] Waiting for ASR session to be ready...');
      let waitTime = 0;
      while (!isSessionReadyRef.current && waitTime < 10000) { // Wait up to 10 seconds
        await new Promise(resolve => setTimeout(resolve, 100));
        waitTime += 100;
      }
      
      if (!isSessionReadyRef.current) {
        throw new Error('ASR session failed to initialize. Please try again.');
      }
      
      console.log('[VIDEO_PROC] ASR session ready. Starting to send audio chunks...');
      
      while (resampleBuffer.length >= Math.floor(desiredOutputLength * resampleRatio)) {
        if (!isProcessingVideoASRRef.current) break;
        
        const processableChunk = resampleBuffer.slice(0, Math.floor(desiredOutputLength * resampleRatio));
        resampleBuffer = resampleBuffer.slice(Math.floor(desiredOutputLength * resampleRatio));

        const downsampledPcm = new Float32Array(desiredOutputLength);
        for (let i = 0; i < desiredOutputLength; i++) {
          const correspondingSourceIndex = Math.floor(i * resampleRatio);
          downsampledPcm[i] = processableChunk[correspondingSourceIndex] || 0;
        }

        const outputInt16 = new Int16Array(downsampledPcm.length);
        for (let i = 0; i < downsampledPcm.length; i++) {
          const s = Math.max(-1, Math.min(1, downsampledPcm[i]));
          outputInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        sendData(outputInt16.buffer);
        chunksSent++;
        
        // Add small delay between chunks to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      console.log(`[VIDEO_PROC] Sent ${chunksSent} audio chunks. Ending stream...`);
      endStream();
      expectingVideoSessionTerminationRef.current = true;
      
      // Set a timeout to handle case where server doesn't respond with SessionTerminated
      // Increase timeout to ensure we get the complete transcript
      setTimeout(() => {
        if (expectingVideoSessionTerminationRef.current) {
          console.log('[VIDEO_PROC] Timeout waiting for session termination, forcing completion');
          // Force the session termination handler
          expectingVideoSessionTerminationRef.current = false;
          isProcessingVideoASRRef.current = false;
          setIsProcessingVideo(false);
          
          const completeVideoTranscript = fullVideoTranscriptRef.current.trim();
          console.log('[VIDEO_PROC] Forcing completion with transcript length:', completeVideoTranscript.length);
          console.log('[VIDEO_PROC] Complete transcript:', completeVideoTranscript);
          
          if (completeVideoTranscript) {
            handleFinalVideoTranscript(completeVideoTranscript, selectedLanguageRef.current);
          } else {
            setError('No speech detected in the video. Please ensure your video contains clear audio.');
          }
          fullVideoTranscriptRef.current = '';
        }
      }, 10000); // 10 second timeout to ensure complete transcript
      
    } catch (err) {
      console.error('[VIDEO_PROC] Error processing video:', err);
      setError(`Error processing video: ${err instanceof Error ? err.message : String(err)}`);
      isProcessingVideoASRRef.current = false;
      expectingVideoSessionTerminationRef.current = false;
      setIsProcessingVideo(false);
    }
  };

  const handleFinalVideoTranscript = async (fullTranscript: string, targetLang: string) => {
    console.log('[FINAL_VIDEO_TRANSCRIPT] Processing transcript of length:', fullTranscript.length);
    console.log('[FINAL_VIDEO_TRANSCRIPT] Full transcript:', fullTranscript);
    
    setError(null);
    try {
      // Split long transcripts into chunks to avoid API limits
      const MAX_CHUNK_LENGTH = 3000; // Characters per chunk
      const chunks: string[] = [];
      
      if (fullTranscript.length <= MAX_CHUNK_LENGTH) {
        chunks.push(fullTranscript);
      } else {
        // Split by sentences to avoid breaking words
        const sentences = fullTranscript.match(/[^.!?]+[.!?]+/g) || [fullTranscript];
        let currentChunk = '';
        
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length <= MAX_CHUNK_LENGTH) {
            currentChunk += sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
      }
      
      console.log(`[FINAL_VIDEO_TRANSCRIPT] Split into ${chunks.length} chunks for translation`);
      
      // Translate each chunk
      const translatedChunks: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`[FINAL_VIDEO_TRANSCRIPT] Translating chunk ${i + 1}/${chunks.length}`);
        const translatedChunk = await translateText(chunks[i], targetLang);
        if (translatedChunk) {
          translatedChunks.push(translatedChunk);
        }
      }
      
      // Combine translated chunks
      const completeTranslation = translatedChunks.join(' ');
      console.log('[FINAL_VIDEO_TRANSCRIPT] Complete translation length:', completeTranslation.length);
      console.log('[FINAL_VIDEO_TRANSCRIPT] Complete translation:', completeTranslation);
      
      if (completeTranslation && cartesiaVoicesRef.current) {
        const selectedVoice = findVoiceForLanguage(targetLang);
        if (selectedVoice) {
          console.log('[FINAL_VIDEO_TRANSCRIPT] Generating TTS with voice:', selectedVoice.name);
          const audioBuffer = await playTTSForVideo(completeTranslation, targetLang, selectedVoice.id);
          if (audioBuffer) {
            console.log('[FINAL_VIDEO_TRANSCRIPT] TTS audio buffer generated successfully');
            setDubbedAudioBuffer(audioBuffer);
          }
        }
      } else {
        console.error('[FINAL_VIDEO_TRANSCRIPT] No translation received or no voices available');
        setError('Translation failed or no voices available');
      }
    } catch (err: any) {
      console.error('[FINAL_VIDEO_TRANSCRIPT] Error in video translation/TTS:', err);
      setError(`Video processing failed: ${err.message}`);
    }
  };

  const findVoiceForLanguage = (language: string) => {
    if (!cartesiaVoicesRef.current) return null;
    
    const normalizeLang = (lang: string = '') => lang.toLowerCase().split('-')[0];
    
    let selectedVoice = cartesiaVoicesRef.current.find(voice => 
      normalizeLang(voice.language) === normalizeLang(language) && 
      (voice.gender?.toLowerCase() === 'female' || voice.name?.toLowerCase().includes('female'))
    );
    
    if (!selectedVoice) {
      selectedVoice = cartesiaVoicesRef.current.find(voice => 
        normalizeLang(voice.language) === normalizeLang(language)
      );
    }
    
    if (!selectedVoice && cartesiaVoicesRef.current.length > 0) {
      selectedVoice = cartesiaVoicesRef.current[0];
    }
    
    return selectedVoice;
  };

  const handleVideoFileChange = (file: File) => {
    isProcessingVideoASRRef.current = false;
    expectingVideoSessionTerminationRef.current = false;
    setSelectedVideoFile(file);
    setDubbedAudioBuffer(null);
    fullVideoTranscriptRef.current = '';
    lastCompletedTranslationRef.current = { text: '', language: '' };
    setFinalizedTranscript('');
    clearTranslation();

    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }
    const newUrl = URL.createObjectURL(file);
    setUploadedVideoUrl(newUrl);
    setError(null);
    
    if (isRecording) {
      stopMicRecording();
    }
    processUploadedVideoAudio(file);
  };

  const startRecording = async () => {
    if (!isConnected) {
      setError('WebSocket is not connected. Cannot start recording.');
      return;
    }
    try {
      await startMicRecording();
      setError(null);
      setFinalizedTranscript('');
      setCurrentPartial('');
      clearTranslation();
    } catch (err) {
      setError(`Error accessing microphone: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const stopRecording = () => {
    stopMicRecording();
    endStream();
    
    // Play TTS for final translation after recording stops
    if (lastCompletedTranslationRef.current.text && cartesiaVoicesRef.current) {
      const voice = findVoiceForLanguage(lastCompletedTranslationRef.current.language);
      if (voice) {
        setTimeout(() => {
          playTTS(
            lastCompletedTranslationRef.current.text,
            lastCompletedTranslationRef.current.language,
            voice.id
          );
        }, 800);
      }
    }
  };

  const handlePlayMicTts = async () => {
    if (lastCompletedTranslationRef.current.text && cartesiaVoicesRef.current) {
      const { text, language } = lastCompletedTranslationRef.current;
      const voice = findVoiceForLanguage(language);
      if (voice) {
        await playTTS(text, language, voice.id);
      }
    } else {
      setError('No microphone translation available to play.');
    }
  };

  // Check for API key
  useEffect(() => {
    const assemblyAiApiKey = process.env.NEXT_PUBLIC_ASSEMBLYAI_API_KEY;
    if (!assemblyAiApiKey || assemblyAiApiKey === 'your_assemblyai_api_key_here') {
      setError('AssemblyAI API Key is not configured. Please set NEXT_PUBLIC_ASSEMBLYAI_API_KEY.');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Real-Time Speech Translation
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Video dubbing and live translation powered by AI
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <LanguageSelector
                languages={targetLanguages}
                selectedLanguage={selectedLanguage}
                onLanguageChange={setSelectedLanguage}
                disabled={isVoicesLoading || !cartesiaVoices}
              />
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900 dark:bg-opacity-20 border border-red-200 dark:border-red-800 rounded-lg animate-fade-in">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Video Section - Hero */}
        <section className="mb-6">
          <VideoPlayer
            onVideoFileChange={handleVideoFileChange}
            videoSrcProp={uploadedVideoUrl || undefined}
            dubbedAudioBuffer={dubbedAudioBuffer}
            isProcessing={isProcessingVideo}
          />
        </section>

        {/* Live Input Section */}
        <section className="mb-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Live Microphone Input</h2>
            
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={!isConnected || isVoicesLoading || !cartesiaVoices || isProcessingVideo}
                  className={`
                    inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 font-medium rounded-lg transition-all duration-200
                    text-sm sm:text-base w-full sm:w-auto justify-center
                    ${isRecording 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-green-600 hover:bg-green-700 text-white'}
                    disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed
                  `}
                >
                  {isRecording ? (
                    <>
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      Start Recording
                    </>
                  )}
                </button>
                
                <button
                  onClick={handlePlayMicTts}
                  disabled={isRecording || !lastCompletedTranslationRef.current.text}
                  className="
                    inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-purple-600 font-medium rounded-lg
                    hover:bg-purple-700 text-white transition-all duration-200
                    text-sm sm:text-base w-full sm:w-auto justify-center
                    disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed
                  "
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                  Play Translation
                </button>
              </div>
              
              {isRecording && !selectedVideoFile && (
                <AudioVisualizer
                  audioLevel={audioLevel}
                  label="Microphone Level"
                  color="green"
                />
              )}
            </div>
          </div>
        </section>

        {/* Results Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <TranscriptionDisplay 
            transcription={finalizedTranscript + currentPartial} 
          />
          
          <TranslationDisplay
            translatedText={translatedText}
            targetLanguage={targetLanguages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}
            isTranslating={isTranslating}
          />
        </section>

        {/* Audio Playback Status */}
        {(isPlayingTTS || ttsAudioLevel > 0) && (
          <section className="mt-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Audio Playback</h3>
              <AudioVisualizer
                audioLevel={ttsAudioLevel}
                label="Translation Audio"
                color="purple"
                height="lg"
              />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}