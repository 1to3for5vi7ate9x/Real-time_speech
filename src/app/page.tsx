'use client';

import React, { useState, useEffect, useRef } from 'react';
import VideoPlayer from '../components/VideoPlayer';
import TranscriptionDisplay from '../components/TranscriptionDisplay';

// Define type for a single Cartesia Voice
interface CartesiaVoice {
  id: string;
  name: string;
  language: string;
  description?: string;
  gender?: string; // Added from user log
  // Add other relevant properties from the API doc if needed
}

export default function Home() {
  const [finalizedTranscript, setFinalizedTranscript] = useState<string>('');
  const [currentPartial, setCurrentPartial] = useState<string>('');
  const [translatedText, setTranslatedText] = useState<string>(''); // For translated text
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0); // For audio visualizer
  const [error, setError] = useState<string | null>(null);

  // Language and Voice State
  const targetLanguages = [
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ja', name: 'Japanese' },
    { code: 'de', name: 'German' },
    // TODO: Add more as needed, ensure Cartesia supports them with available voices
  ];
  const [selectedLanguage, setSelectedLanguage] = useState<string>(targetLanguages[0].code);
  const selectedLanguageRef = useRef<string>(selectedLanguage);
  const [cartesiaVoices, setCartesiaVoices] = useState<CartesiaVoice[] | null>(null);
  const cartesiaVoicesRef = useRef<CartesiaVoice[] | null>(null); // Ref for voices
  const [isVoicesLoading, setIsVoicesLoading] = useState<boolean>(true);
  const isVoicesLoadingRef = useRef<boolean>(true); // Ref for loading state

  const ws = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null); // For volume meter
  const microphoneSource = useRef<MediaStreamAudioSourceNode | null>(null); // Source for analyser
  const scriptProcessorNodeRef = useRef<ScriptProcessorNode | null>(null); // For PCM data
  const mediaStreamRef = useRef<MediaStream | null>(null); // To hold the stream for stopping tracks
  const isRecordingRef = useRef<boolean>(false);

  // Fetch Cartesia Voices on component mount
  useEffect(() => {
    // Fetch available voices from Cartesia
    const fetchVoices = async () => {
      setIsVoicesLoading(true);
      try {
        const response = await fetch('/api/voices');
        if (!response.ok) {
          throw new Error(`Failed to fetch voices: ${response.statusText}`);
        }
        const data = await response.json();
        // Handle both response formats - either direct array or {voices: array}
        const voices = Array.isArray(data) ? data : (data.voices || []);
        setCartesiaVoices(voices);
        console.log(`Loaded ${voices.length} Cartesia voices.`);
      } catch (err) {
        console.error('Error fetching Cartesia voices:', err);
        setError(`Failed to load TTS voices: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsVoicesLoading(false);
      }
    };

    fetchVoices();
  }, []);

  useEffect(() => {
    const assemblyAiApiKey = process.env.NEXT_PUBLIC_ASSEMBLYAI_API_KEY;
    if (!assemblyAiApiKey || assemblyAiApiKey === 'your_assemblyai_api_key_here') {
      setError('AssemblyAI API Key is not configured in .env.local or is a placeholder. Please set NEXT_PUBLIC_ASSEMBLYAI_API_KEY.');
    }

    const websocketUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3000/ws/asr';
    
    ws.current = new WebSocket(websocketUrl);

    ws.current.onopen = () => {
      console.log(`WebSocket connected to ${websocketUrl}`);
      setIsConnected(true);
      setError(null);
    };

    ws.current.onmessage = (event) => {
      const rawMessage = event.data as string;
      console.log('Raw message from server:', rawMessage);
      try {
        // Attempt to parse as JSON, but handle plain strings too
        if (rawMessage.startsWith('{') && rawMessage.endsWith('}')) { // Basic check for JSON-like string
            const message = JSON.parse(rawMessage);
            console.log('Parsed JSON from server:', message);

            if (message.type === 'ASSEMBLYAI_TRANSCRIPT' && message.transcript) {
              const transcriptData = message.transcript;
              if (transcriptData.message_type === "PartialTranscript") {
                setCurrentPartial(transcriptData.text);
                // For real-time experience, also translate partial transcripts if they're substantial
                // Only translate if the partial transcript is at least 5 characters long and contains a word
                if (transcriptData.text.trim().length >= 5 && transcriptData.text.includes(' ')) {
                  // Use debounced translation for partial transcripts to avoid too many requests
                  debouncedTranslateText(transcriptData.text, selectedLanguageRef.current, true, 300);
                }
              } else if (transcriptData.message_type === "FinalTranscript" && transcriptData.text) {
                const newFinalText = transcriptData.text;
                // Append final text to the finalized transcript
                setFinalizedTranscript(prev => prev + newFinalText + ' ');
                setCurrentPartial(''); // Clear partial after final

                // Call translation API - but only if we haven't already translated this text as a partial
                // This prevents double translations of the same content
                if (newFinalText.trim() && newFinalText !== lastProcessedTextRef.current.text) {
                  console.log(`[TRANSLATE_TRIGGER] Final transcript received. Current selectedLanguageRef value: ${selectedLanguageRef.current}. Text: "${newFinalText}"`);
                  translateText(newFinalText, selectedLanguageRef.current, false); // Use the ref's current value
                } else {
                  console.log(`[TRANSLATE_TRIGGER] Skipping final translation as it was already processed as partial: "${newFinalText}"`);
                }
              }
            } else if (message.type === 'ASSEMBLYAI_SESSION_OPENED') {
              console.log('AssemblyAI session opened:', message.sessionId);
            } else if (message.type === 'ERROR' || message.type === 'ASSEMBLYAI_ERROR') {
              console.error('Error from WebSocket server:', message.message || message.error?.message);
            }
        } else {
            // Handle plain text messages (like our initial welcome message)
            console.log('Received plain text from server:', rawMessage);
            // If it's the welcome message, we might just log it or display it somewhere
            if (rawMessage.includes("Welcome to")) {
                // Potentially set a status or log, but don't try to add to transcription
            }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message or handle it:', error, 'Raw message was:', rawMessage);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected from /api/asr');
      setIsConnected(false);
      if (isRecording) { // Stop recording if connection drops
        stopRecording();
      }
    };

    ws.current.onerror = (errorEvent) => {
      console.error('WebSocket error:', errorEvent);
      setError('WebSocket connection error. Check the console.');
      setIsConnected(false);
    };

    return () => {
      // Cleanup on component unmount
      if (ws.current) {
        ws.current.close();
      }
      if (audioContext.current && audioContext.current.state !== 'closed') {
        audioContext.current.close();
      }
      // Also clean up TTS audio context on unmount, but not during normal operation
      if (ttsAudioContext.current && ttsAudioContext.current.state !== 'closed') {
        console.log('[TTS_PLAYBACK] Closing TTS AudioContext on component unmount');
        ttsAudioContext.current.close();
      }
    };
  }, []);

  // Effect to keep selectedLanguageRef updated
  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  // Effect to keep cartesiaVoicesRef updated
  useEffect(() => {
    cartesiaVoicesRef.current = cartesiaVoices;
    isVoicesLoadingRef.current = isVoicesLoading;
  }, [cartesiaVoices, isVoicesLoading]);
  
  // Debounce function for partial translations
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track the last processed text to avoid duplicates
  const lastProcessedTextRef = useRef<{text: string, isPartial: boolean}>({text: '', isPartial: false});
  // Track the last translated text to prevent duplication in the UI
  const lastTranslatedTextRef = useRef<string>('');
  const lastCompletedTranslationRef = useRef<{text: string, language: string}>({text: '', language: ''});
  // Track the last TTS call to prevent duplicates
  const lastTtsCallRef = useRef<{text: string, voiceId: string, isPartial: boolean}>({text: '', voiceId: '', isPartial: false});
  
  const debouncedTranslateText = (text: string, targetLang: string, isPartial: boolean = true, delay: number = 500) => {
    // Clear any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Set a new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      // Only process if this text+isPartial combination hasn't been processed recently
      if (text !== lastProcessedTextRef.current.text || isPartial !== lastProcessedTextRef.current.isPartial) {
        translateText(text, targetLang, isPartial);
        lastProcessedTextRef.current = {text, isPartial};
      }
    }, delay);
  };

  // Function to split text into smaller chunks for better TTS processing
  const splitTextIntoChunks = (text: string) => {
    console.log(`[TTS_CHUNKING] Splitting text: "${text}"`);
    
    // First try to split by sentence boundaries with improved regex
    // This captures more sentence-ending punctuation and handles multiple spaces
    const sentenceRegex = /[.!?]+[\s"'\)\]]*(?=[A-Z]|$)/g;
    let sentences = text.split(sentenceRegex).filter(s => s.trim().length > 0);
    
    // Add back the sentence-ending punctuation that was removed by the split
    sentences = sentences.map((sentence, i, arr) => {
      if (i < arr.length - 1) {
        // Find the punctuation that ended this sentence
        const match = text.substring(
          text.indexOf(sentence) + sentence.length, 
          text.indexOf(sentence) + sentence.length + 5
        ).match(/[.!?]+/);
        return match ? sentence + match[0] : sentence;
      }
      return sentence;
    });
    
    if (sentences.length > 1) {
      console.log(`[TTS_CHUNKING] Split into ${sentences.length} sentences`);
      return sentences;
    }
    
    // If no sentence breaks, try splitting by commas, semicolons, or other natural pauses
    // Enhanced regex to catch more pause patterns
    const pauseRegex = /[,;:\-–—]\s+|\s+[-–—]\s+|\(|\)|\[|\]/g;
    const phrases = text.split(pauseRegex).filter(p => p.trim());
    
    if (phrases.length > 1) {
      console.log(`[TTS_CHUNKING] Split into ${phrases.length} phrases`);
      return phrases;
    }
    
    // If still just one chunk and it's long, split by breath groups (natural speaking patterns)
    // Most people pause slightly every 5-8 words when speaking naturally
    const words = text.split(/\s+/);
    if (words.length > 8) {
      const chunks = [];
      let currentChunk = '';
      let wordCount = 0;
      const optimalChunkSize = 8; // Natural breath group size for speech
      
      for (const word of words) {
        // Look for natural breaking points (conjunctions, prepositions) near the optimal chunk size
        const isNaturalBreakWord = /^(and|but|or|nor|for|so|yet|after|before|when|while|if|unless|until|because|since|though|although)$/i.test(word);
        
        if ((wordCount >= optimalChunkSize && isNaturalBreakWord) || wordCount >= optimalChunkSize + 3) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
          wordCount = 0;
        }
        
        currentChunk += word + ' ';
        wordCount++;
      }
      
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      console.log(`[TTS_CHUNKING] Split into ${chunks.length} breath-group chunks`);
      return chunks;
    }
    
    // If all else fails, return the original text as a single chunk
    console.log('[TTS_CHUNKING] No splitting needed, returning single chunk');
    return [text];
  };

  // Function to process TTS for a specific voice and text
  const processTtsForVoice = (text: string, language: string) => {
    if (!text.trim() || !cartesiaVoicesRef.current || cartesiaVoicesRef.current.length === 0) return;
    
    const languageCodeForCartesia = language;
    const normalizeLang = (lang: string = '') => lang.toLowerCase().split('-')[0];
    
    // Find a voice that matches the target language
    // Prefer female voices when available
    let selectedVoice = cartesiaVoicesRef.current.find(voice => 
      normalizeLang(voice.language) === normalizeLang(languageCodeForCartesia) && 
      (voice.gender?.toLowerCase() === 'female' || (voice.name && voice.name.toLowerCase().includes('female')))
    );
    
    // If no female voice, try any voice for the language
    if (!selectedVoice) {
      selectedVoice = cartesiaVoicesRef.current.find(voice => 
        normalizeLang(voice.language) === normalizeLang(languageCodeForCartesia)
      );
    }
    
    // If still no match, use the first voice (fallback)
    if (!selectedVoice && cartesiaVoicesRef.current.length > 0) {
      selectedVoice = cartesiaVoicesRef.current[0];
      console.warn(`[TTS_PLAYBACK] No voice found for language ${languageCodeForCartesia}, using fallback: ${selectedVoice.name}`);
    }
    
    if (selectedVoice) {
      // Skip if this is the same text we just processed (prevents duplicates)
      if (text === lastTtsCallRef.current.text && selectedVoice.id === lastTtsCallRef.current.voiceId) {
        console.log(`[TTS_PLAYBACK] Skipping duplicate TTS call for: "${text}"`);
        return;
      }
      
      // Update the last TTS call ref
      lastTtsCallRef.current = {text, voiceId: selectedVoice.id, isPartial: false};
      
      // Add a small delay before processing to ensure audio pipeline is ready
      // This helps with voice quality by allowing previous audio processing to complete
      const processingDelay = 0; // Reduced delay
      
      // Call the TTS function with a small delay to ensure proper sequencing
      console.log(`[TTS_PLAYBACK] Processing TTS for chunk: "${text}" with voice ${selectedVoice.name} after ${processingDelay}ms delay`);
      // setTimeout(() => { // Removed setTimeout for direct call
      playTtsAudio(text, languageCodeForCartesia, selectedVoice.id);
      // }, processingDelay);
    } else {
      console.error(`[TTS_PLAYBACK] No suitable voice found for language: ${languageCodeForCartesia}`);
      setError(`TTS Error: No suitable voice found for language: ${languageCodeForCartesia}`);
    }
  };

  // Function to translate text and trigger TTS
  const translateText = async (textToTranslate: string, targetLang: string, isPartial: boolean = false) => {
    if (!textToTranslate.trim()) return;
    
    // Skip if this is the same text we just processed (prevents duplicates)
    if (textToTranslate === lastProcessedTextRef.current.text && isPartial === lastProcessedTextRef.current.isPartial) {
      return;
    }
    
    console.log(`Requesting translation for: "${textToTranslate}" to ${targetLang}${isPartial ? ' (partial)' : ''}`);
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: textToTranslate, targetLang }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Translation API request failed: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('Translation received:', data.translatedText);
      // Handle the translated text differently based on whether it's from a partial or final transcript
      const newTranslatedText = data.translatedText;
      
      // Store this text in our tracking refs to prevent duplicates
      lastProcessedTextRef.current = {text: textToTranslate, isPartial};
      
      if (isPartial) {
        // For partial translations, just replace the current text
        // This creates a more real-time experience as the translation updates
        setTranslatedText(newTranslatedText);
        lastTranslatedTextRef.current = newTranslatedText;
      } else {
        // For final translations, check if this text is already part of the translated text
        // to avoid duplication
        if (!lastTranslatedTextRef.current.includes(newTranslatedText)) {
          setTranslatedText(prev => {
            // If the previous text was from a partial that's similar to this final,
            // replace it instead of appending
            if (lastTranslatedTextRef.current && 
                newTranslatedText.includes(lastTranslatedTextRef.current.substring(0, lastTranslatedTextRef.current.length/2))) {
              return newTranslatedText + ' ';
            }
            return prev + newTranslatedText + ' ';
          });
        } else {
          // If the final translation is already included (likely from a partial), don't append
          console.log('Skipping duplicate final translation');
        }
      }

      // Store the latest translation in a ref for TTS when recording stops
      // Only update if this is a final translation (not partial)
      if (!isPartial && newTranslatedText.trim()) {
        console.log('[TRANSLATION] Final translation stored for TTS when recording stops');
        // Store the translation and target language for TTS when recording stops
        lastCompletedTranslationRef.current = {
          text: newTranslatedText,
          language: targetLang
        };
      }
    } catch (err: any) {
      console.error('Error translating text:', err);
      setError(`Translation failed: ${err.message}`);
      // Optionally clear translatedText or show specific error in its display
    }
  };

  const startRecording = async () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket is not connected. Cannot start recording.');
      return;
    }
    if (isRecordingRef.current) {
      console.log('Already recording.');
      return;
    }

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } else if (audioContext.current.state === 'suspended') {
        await audioContext.current.resume();
      }
      
      const currentAudioContext = audioContext.current; // Ensure we use the initialized context

      // --- Audio Visualizer Setup ---
      if (!analyser.current) {
        analyser.current = currentAudioContext.createAnalyser();
        analyser.current.fftSize = 256;
      }
      if (microphoneSource.current) {
        microphoneSource.current.disconnect();
      }
      microphoneSource.current = currentAudioContext.createMediaStreamSource(mediaStreamRef.current);
      microphoneSource.current.connect(analyser.current);
      
      const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
      const drawVolume = () => {
        if (!isRecordingRef.current || !analyser.current) {
          setAudioLevel(0);
          if (isRecordingRef.current) requestAnimationFrame(drawVolume); // Keep trying if still recording
          return;
        }
        analyser.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setAudioLevel(sum / dataArray.length);
        requestAnimationFrame(drawVolume);
      };
      // --- End Audio Visualizer Setup ---

      // --- PCM Audio Processing ---
      const source = currentAudioContext.createMediaStreamSource(mediaStreamRef.current);
      const targetSampleRate = 16000;
      const sourceSampleRate = currentAudioContext.sampleRate;
      
      // Buffer size for ScriptProcessorNode. We want chunks of ~250ms.
      // At 16kHz, 250ms = 4000 samples. ScriptProcessorNode bufferSize must be a power of 2.
      // We'll use a buffer size that's appropriate for the *source* sample rate,
      // then downsample. Let's aim for roughly 250ms of source audio to process at a time.
      // e.g., if source is 48kHz, 0.25s = 12000 samples. Closest power of 2 might be 8192 or 16384.
      // Let's use a common buffer size like 4096 for the ScriptProcessorNode,
      // which means it fires more often, and we accumulate/downsample.
      const bufferSize = 4096;

      if (scriptProcessorNodeRef.current) {
        scriptProcessorNodeRef.current.disconnect();
      }
      scriptProcessorNodeRef.current = currentAudioContext.createScriptProcessor(bufferSize, 1, 1);

      let resampleBuffer = new Float32Array(0); // Buffer to accumulate samples for resampling

      scriptProcessorNodeRef.current.onaudioprocess = (audioProcessingEvent) => {
        if (!isRecordingRef.current || !ws.current || ws.current.readyState !== WebSocket.OPEN) {
          return;
        }
        const inputPcmData = audioProcessingEvent.inputBuffer.getChannelData(0);
        
        // Naive resampling: append to buffer, then process when enough for target rate
        // This is a simple way to illustrate; a proper resampler (e.g., using interpolation) is better.
        const newLength = resampleBuffer.length + inputPcmData.length;
        const tempBuffer = new Float32Array(newLength);
        tempBuffer.set(resampleBuffer, 0);
        tempBuffer.set(inputPcmData, resampleBuffer.length);
        resampleBuffer = tempBuffer;

        const resampleRatio = sourceSampleRate / targetSampleRate;
        const desiredOutputLength = Math.floor(targetSampleRate * 0.250); // Aim for 250ms chunks at 16kHz = 4000 samples

        while (resampleBuffer.length >= Math.floor(desiredOutputLength * resampleRatio) ) {
            const processableChunk = resampleBuffer.slice(0, Math.floor(desiredOutputLength * resampleRatio));
            resampleBuffer = resampleBuffer.slice(Math.floor(desiredOutputLength * resampleRatio));

            const downsampledPcm = new Float32Array(desiredOutputLength);
            for (let i = 0; i < desiredOutputLength; i++) {
                // Simple nearest-neighbor (crude, but better than nothing for a test)
                // A better approach would be linear interpolation or a proper filter.
                const correspondingSourceIndex = Math.floor(i * resampleRatio);
                if (correspondingSourceIndex < processableChunk.length) {
                    downsampledPcm[i] = processableChunk[correspondingSourceIndex];
                } else {
                    downsampledPcm[i] = 0; // Should not happen if logic is correct
                }
            }

            // Convert to 16-bit PCM
            const outputInt16 = new Int16Array(downsampledPcm.length);
            for (let i = 0; i < downsampledPcm.length; i++) {
              const s = Math.max(-1, Math.min(1, downsampledPcm[i]));
              outputInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                 ws.current.send(outputInt16.buffer);
            }
        }
      };

      source.connect(scriptProcessorNodeRef.current);
      scriptProcessorNodeRef.current.connect(currentAudioContext.destination); // Necessary for onaudioprocess

      setIsRecording(true);
      isRecordingRef.current = true;
      requestAnimationFrame(drawVolume); // Start volume visualizer
      setError(null);
      setFinalizedTranscript('');
      setCurrentPartial('');
      setTranslatedText(''); // Clear previous translations on new recording
    } catch (err) {
      console.error('Error accessing microphone or starting Web Audio recording:', err);
      setError(`Error accessing microphone: ${err instanceof Error ? err.message : String(err)}`);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = () => {
    if (!isRecordingRef.current) {
      // console.log('Not recording or already stopped.');
      return;
    }
    console.log('Stopping recording...');

    isRecordingRef.current = false; // This will stop the drawVolume RAF and onaudioprocess sending
    setIsRecording(false);
    setAudioLevel(0);

    if (scriptProcessorNodeRef.current) {
      scriptProcessorNodeRef.current.disconnect();
      // scriptProcessorNodeRef.current.onaudioprocess = null; // Clear handler
      scriptProcessorNodeRef.current = null;
    }
    if (microphoneSource.current) { // For visualizer
      microphoneSource.current.disconnect();
      microphoneSource.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    // Don't close audioContext immediately, allow it to be reused. Close on unmount.
    // Note: We're only closing the recording audioContext, NOT the TTS audioContext
    // The TTS audioContext (ttsAudioContext.current) should remain untouched here
    // to ensure TTS playback works after recording stops

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log('Sending endStream to server.');
      ws.current.send(JSON.stringify({ action: "endStream" }));
    }
    
    // Process TTS for the final translation after recording stops
    // This ensures we wait for the complete translation before starting TTS
    if (lastCompletedTranslationRef.current && lastCompletedTranslationRef.current.text) {
      console.log('[TTS_PLAYBACK] Processing TTS for final translation after recording stopped');
      
      // Wait for a moment to ensure any final translations have completed
      setTimeout(() => {
        // Clear any existing audio queue to prevent overlap
        if (audioQueue.current.length > 0) {
          console.log(`[TTS_PLAYBACK] Clearing existing audio queue with ${audioQueue.current.length} items`);
          audioQueue.current = [];
        }
        
        // Process the full final translation text without chunking
        const { text, language } = lastCompletedTranslationRef.current;
        console.log(`[TTS_PLAYBACK] Processing complete translation: "${text}"`);
        processTtsForVoice(text, language);
        
        // Reset the reference after processing
        lastCompletedTranslationRef.current = { text: '', language: '' };
      }, 800); // Wait 800ms to ensure final translation is complete
    }
  };

  const audioQueue = useRef<AudioBuffer[]>([]);
  const isPlayingTtsRef = useRef<boolean>(false);
  const ttsAudioContext = useRef<AudioContext | null>(null);
  const ttsAnalyser = useRef<AnalyserNode | null>(null);
  const ttsLatencyStartTime = useRef<number | null>(null);
  const ttsLatency = useRef<number | null>(null);
  const ttsVisualizerDataArray = useRef<Uint8Array | null>(null);
  const ttsVisualizerAnimationFrame = useRef<number | null>(null);
  const [ttsAudioLevel, setTtsAudioLevel] = useState<number>(0);

  // Function to start the TTS visualizer animation
  const startTtsVisualizer = () => {
    if (!ttsAnalyser.current || !ttsVisualizerDataArray.current) return;
    
    const updateVisualizer = () => {
      if (!ttsAnalyser.current || !ttsVisualizerDataArray.current) return;
      
      // Get frequency data
      ttsAnalyser.current.getByteFrequencyData(ttsVisualizerDataArray.current);
      
      // Calculate average level for visualization
      let sum = 0;
      for (let i = 0; i < ttsVisualizerDataArray.current.length; i++) {
        sum += ttsVisualizerDataArray.current[i];
      }
      const average = sum / ttsVisualizerDataArray.current.length;
      setTtsAudioLevel(average);
      
      // Continue animation if we're still playing
      if (isPlayingTtsRef.current) {
        ttsVisualizerAnimationFrame.current = requestAnimationFrame(updateVisualizer);
      } else {
        // Fade out when not playing
        if (average > 0) {
          setTtsAudioLevel(prev => Math.max(0, prev * 0.9));
          ttsVisualizerAnimationFrame.current = requestAnimationFrame(updateVisualizer);
        } else {
          setTtsAudioLevel(0);
        }
      }
    };
    
    // Cancel any existing animation frame
    if (ttsVisualizerAnimationFrame.current) {
      cancelAnimationFrame(ttsVisualizerAnimationFrame.current);
    }
    
    // Start the animation
    ttsVisualizerAnimationFrame.current = requestAnimationFrame(updateVisualizer);
  };

  const playNextInQueue = () => {
    console.log(`[TTS_PLAYBACK] playNextInQueue called. Queue length: ${audioQueue.current.length}, isPlaying: ${isPlayingTtsRef.current}`);
    
    if (isPlayingTtsRef.current || audioQueue.current.length === 0) {
      if (audioQueue.current.length === 0) {
        isPlayingTtsRef.current = false; // Ensure flag is reset if queue empties
        console.log('[TTS_PLAYBACK] Queue is empty, nothing to play');
        
        // Calculate and log latency when playback finishes
        if (ttsLatencyStartTime.current !== null) {
          const endTime = performance.now();
          ttsLatency.current = endTime - ttsLatencyStartTime.current;
          console.log(`[TTS_LATENCY] Total TTS processing and playback latency: ${ttsLatency.current.toFixed(2)}ms`);
          ttsLatencyStartTime.current = null;
        }
      } else {
        console.log('[TTS_PLAYBACK] Already playing, will play next chunk when current one finishes');
      }
      return;
    }
    
    isPlayingTtsRef.current = true;

    const audioBufferToPlay = audioQueue.current.shift();
    if (!audioBufferToPlay) {
      console.error('[TTS_PLAYBACK] Shifted null/undefined buffer from queue');
      isPlayingTtsRef.current = false;
      return;
    }
    
    if (!ttsAudioContext.current) {
      console.error('[TTS_PLAYBACK] AudioContext is null when attempting to play buffer');
      isPlayingTtsRef.current = false;
      return;
    }
    
    try {
      console.log(`[TTS_PLAYBACK] Creating buffer source for playback. Buffer length: ${audioBufferToPlay.length} samples, duration: ${audioBufferToPlay.duration.toFixed(2)}s`);
      
      const source = ttsAudioContext.current.createBufferSource();
      source.buffer = audioBufferToPlay;
      
      // Add a small delay before starting the next chunk to ensure proper sequencing
      // This helps with the voice quality by giving the audio system time to process
      const startDelay = 0; // 0ms delay, was 0.05
      
      // Connect through analyzer for visualization if it exists
      if (ttsAnalyser.current) {
        source.connect(ttsAnalyser.current);
        ttsAnalyser.current.connect(ttsAudioContext.current.destination);
        // Start visualizer animation if not already running
        startTtsVisualizer();
      } else {
        source.connect(ttsAudioContext.current.destination);
      }
      
      source.onended = () => {
        console.log('[TTS_PLAYBACK] Audio chunk finished playing');
        // Add a small delay before processing the next chunk
        // This ensures the audio system has time to fully process the current chunk
        // setTimeout(() => { // Removed timeout for direct call
        isPlayingTtsRef.current = false;
        playNextInQueue(); // Play next chunk if available
        // }, 0); // Was 20ms delay
      };
      
      console.log('[TTS_PLAYBACK] Starting audio playback');
      source.start(ttsAudioContext.current.currentTime + startDelay);
    } catch (err: any) {
      console.error('[TTS_PLAYBACK] Error starting audio playback:', err);
      isPlayingTtsRef.current = false;
      // Try to play the next item in case this was just a corrupted buffer
      setTimeout(playNextInQueue, 50); // Increased delay for error recovery
    }
  };

  const playTtsAudio = async (textToSpeak: string, language: string, voiceId: string) => {
    console.log(`[TTS_PLAYBACK] Requesting TTS audio for: "${textToSpeak}"`);
    
    // Start latency measurement
    ttsLatencyStartTime.current = performance.now();
    console.log(`[TTS_LATENCY] Starting latency measurement at ${ttsLatencyStartTime.current}ms`);
    
    // Check and initialize or resume AudioContext
    if (!ttsAudioContext.current) {
      console.log('[TTS_PLAYBACK] Creating new AudioContext with sampleRate 44100');
      try {
        ttsAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 44100 // Should match the incoming stream's sample rate
        });
        console.log('[TTS_PLAYBACK] AudioContext created successfully, state:', ttsAudioContext.current.state);
        
        // Create analyzer for visualization
        ttsAnalyser.current = ttsAudioContext.current.createAnalyser();
        ttsAnalyser.current.fftSize = 256;
        ttsVisualizerDataArray.current = new Uint8Array(ttsAnalyser.current.frequencyBinCount);
        console.log('[TTS_PLAYBACK] Created analyzer for TTS visualization');
        
      } catch (err: any) {
        console.error('[TTS_PLAYBACK] Failed to create AudioContext:', err);
        setError(`TTS Error: Could not create audio context - ${err.message}`);
        return;
      }
    } else if (ttsAudioContext.current.state === 'suspended') {
      console.log('[TTS_PLAYBACK] Resuming suspended AudioContext');
      try {
        await ttsAudioContext.current.resume();
        console.log('[TTS_PLAYBACK] AudioContext resumed successfully, state:', ttsAudioContext.current.state);
        
        // Create analyzer if it doesn't exist
        if (!ttsAnalyser.current && ttsAudioContext.current) {
          ttsAnalyser.current = ttsAudioContext.current.createAnalyser();
          ttsAnalyser.current.fftSize = 256;
          ttsVisualizerDataArray.current = new Uint8Array(ttsAnalyser.current.frequencyBinCount);
          console.log('[TTS_PLAYBACK] Created analyzer for TTS visualization');
        }
      } catch (err: any) {
        console.error('[TTS_PLAYBACK] Failed to resume AudioContext:', err);
        setError(`TTS Error: Could not resume audio context - ${err.message}`);
        return;
      }
    }
    
    try {
      console.log('[TTS_PLAYBACK] Sending fetch request to /api/tts');
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: textToSpeak, language, voiceId }),
      });

      if (!response.ok || !response.body) {
        const errData = await response.text();
        console.error('[TTS_PLAYBACK] API response not OK:', response.status, response.statusText, errData);
        throw new Error(`TTS API request failed: ${response.statusText} - ${errData}`);
      }

      console.log('[TTS_PLAYBACK] API response OK, getting reader');
      const reader = response.body.getReader();
      const audioContextForPlayback = ttsAudioContext.current; // Use the ref
      
      if (!audioContextForPlayback) {
        throw new Error('AudioContext is null after successful API response');
      }

      console.log('[TTS_PLAYBACK] Starting to process audio stream');
      let totalBytesReceived = 0;
      let chunksProcessed = 0;
      
      // Clear existing queue to start fresh
      audioQueue.current = [];
      isPlayingTtsRef.current = false;

      // Process the stream
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`[TTS_PLAYBACK] Stream finished. Processed ${chunksProcessed} chunks, ${totalBytesReceived} bytes total.`);
          break;
        }
        
        if (value) {
          totalBytesReceived += value.byteLength;
          chunksProcessed++;
          
          console.log(`[TTS_PLAYBACK] Received chunk ${chunksProcessed}: ${value.byteLength} bytes`);
          
          if (audioContextForPlayback) {
            // value is Uint8Array, convert to Float32Array for pcm_f32le
            // Each float32 is 4 bytes.
            const float32Array = new Float32Array(value.buffer, value.byteOffset, value.byteLength / 4);
            
            console.log(`[TTS_PLAYBACK] Converted to Float32Array: ${float32Array.length} samples`);
            
            if (float32Array.length > 0) {
              try {
                // Apply enhanced smoothing to reduce audio artifacts
                // This helps with the "scratchy" sound and improves voice clarity
                // const smoothedArray = new Float32Array(float32Array.length);
                
                // // First pass: 7-point weighted moving average filter for better smoothing
                // // This provides more natural voice quality by reducing high-frequency noise
                // for (let i = 3; i < float32Array.length - 3; i++) {
                //   // Weighted average with center sample having more influence
                //   // Using a wider window with carefully tuned weights for better voice quality
                //   smoothedArray[i] = (
                //     float32Array[i-3] * 0.02 +
                //     float32Array[i-2] * 0.05 +
                //     float32Array[i-1] * 0.12 +
                //     float32Array[i] * 0.62 +
                //     float32Array[i+1] * 0.12 +
                //     float32Array[i+2] * 0.05 +
                //     float32Array[i+3] * 0.02
                //   );
                // }
                
                // // Handle edge cases with improved boundary handling
                // // This prevents clicks and pops at the start and end of audio chunks
                // smoothedArray[0] = float32Array[0] * 0.8; // Slight fade-in
                // smoothedArray[1] = (float32Array[0] * 0.2 + float32Array[1] * 0.6 + float32Array[2] * 0.2);
                // smoothedArray[2] = (float32Array[0] * 0.05 + float32Array[1] * 0.15 + float32Array[2] * 0.6 + float32Array[3] * 0.15 + float32Array[4] * 0.05);
                
                // // Handle the end of the array
                // smoothedArray[float32Array.length-3] = (float32Array[float32Array.length-5] * 0.05 +
                //                                      float32Array[float32Array.length-4] * 0.15 +
                //                                      float32Array[float32Array.length-3] * 0.6 +
                //                                      float32Array[float32Array.length-2] * 0.15 +
                //                                      float32Array[float32Array.length-1] * 0.05);
                // smoothedArray[float32Array.length-2] = (float32Array[float32Array.length-3] * 0.2 +
                //                                      float32Array[float32Array.length-2] * 0.6 +
                //                                      float32Array[float32Array.length-1] * 0.2);
                // smoothedArray[float32Array.length-1] = float32Array[float32Array.length-1] * 0.8; // Slight fade-out
                
                const audioBuffer = audioContextForPlayback.createBuffer(
                  1, // numberOfChannels (mono)
                  float32Array.length, // length (number of frames) // Using float32Array directly
                  audioContextForPlayback.sampleRate // Use the actual sample rate of the context
                );
                
                audioBuffer.getChannelData(0).set(float32Array); // Using float32Array directly
                audioQueue.current.push(audioBuffer);
                console.log(`[TTS_PLAYBACK] Added buffer to queue. Queue length: ${audioQueue.current.length}`);
                
                // Attempt to play the next item in the queue
                playNextInQueue();
              } catch (bufferErr: any) {
                console.error('[TTS_PLAYBACK] Error creating audio buffer:', bufferErr);
              }
            } else {
              console.warn('[TTS_PLAYBACK] Received empty Float32Array, skipping buffer creation');
            }
          } else {
            console.error('[TTS_PLAYBACK] AudioContext is null during stream processing');
          }
        }
      }
    } catch (err: any) {
      console.error('[TTS_PLAYBACK] Error in TTS playback process:', err);
      setError(`TTS playback failed: ${err.message}`);
    }
  };


  return (
    <div className="flex flex-col items-center min-h-screen p-4 sm:p-8 bg-gray-50">
      <header className="w-full max-w-4xl mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">
          Real-Time Speech Translation POC
        </h1>
        <p className="text-sm text-gray-600 mt-2">
          WebSocket Status: {isConnected ? <span className="text-green-600 font-semibold">Connected</span> : <span className="text-red-600 font-semibold">Disconnected</span>}
        </p>
        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
        {isVoicesLoading && <p className="text-sm text-blue-500 mt-1">Loading voices...</p>}
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-8">
        <section aria-labelledby="controls-section" className="flex flex-col items-center gap-4">
          {/* Language Selector */}
          <div className="mb-4">
            <label htmlFor="language-select" className="mr-2 font-semibold text-gray-700">Translate to:</label>
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value);
                setTranslatedText(''); // Clear previous translation when language changes
              }}
              disabled={isVoicesLoading || (!cartesiaVoices || cartesiaVoices.length === 0)}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {isVoicesLoading ? (
                <option>Loading voices...</option>
              ) : (!cartesiaVoices || cartesiaVoices.length === 0) ? (
                <option>Voice data loading/failed</option>
              ) : (
                targetLanguages.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))
              )}
            </select>
          </div>
          
          <div className="flex justify-center gap-4">
            <button
            onClick={startRecording}
            disabled={isRecording || !isConnected || isVoicesLoading || (!cartesiaVoices || cartesiaVoices.length === 0)}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Start Recording
          </button>
          <button
            onClick={stopRecording}
            disabled={!isRecording}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-400"
          >
            Stop Recording
          </button>
          </div>
          {isRecording && (
            <div className="w-full max-w-xs bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 my-2">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-50 ease-linear"
                style={{ width: `${Math.min(100, (audioLevel / 128) * 100)}%` }} // Normalize roughly to 0-100%
              ></div>
            </div>
          )}
        </section>

        <section aria-labelledby="video-player-section">
          <h2 id="video-player-section" className="sr-only">Video Player</h2>
          <VideoPlayer />
        </section>

        <section aria-labelledby="transcription-section">
          <h2 id="transcription-section" className="sr-only">Transcription</h2>
          <TranscriptionDisplay transcription={finalizedTranscript + currentPartial} />
        </section>

        {/* Translated Text Display */}
        <section aria-labelledby="translation-section">
          <h2 className="text-lg font-semibold mb-2 text-gray-700">Translated Text ({targetLanguages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}):</h2>
          <div className="w-full h-32 bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-y-auto">
            <p className="text-gray-600 whitespace-pre-wrap">
              {translatedText || "Waiting for translation..."}
            </p>
          </div>
        </section>
        
        {/* TTS Audio Playback Visualizer */}
        <section aria-labelledby="tts-audio-section">
            <h2 className="text-lg font-semibold mb-2 text-gray-700">Translated Audio Playback:</h2>
            <div className="p-4 bg-gray-100 rounded-md">
                <div className="flex flex-col gap-2">
                    <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                        <div
                            className="bg-blue-600 h-4 rounded-full transition-all duration-50 ease-linear"
                            style={{ width: `${Math.min(100, (ttsAudioLevel / 128) * 100)}%` }}
                        ></div>
                    </div>
                    {ttsLatency.current !== null && (
                        <div className="text-sm text-gray-600">
                            TTS Latency: {ttsLatency.current.toFixed(0)}ms
                        </div>
                    )}
                </div>
            </div>
        </section>

      </main>

      <footer className="w-full max-w-4xl mt-12 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} POC Demo. All rights reserved (not really).</p>
      </footer>
    </div>
  );
}
