import { useRef, useState, useCallback } from 'react';

interface UseTTSReturn {
  ttsAudioLevel: number;
  isPlayingTTS: boolean;
  playTTS: (text: string, language: string, voiceId: string) => Promise<void>;
  playTTSForVideo: (text: string, language: string, voiceId: string) => Promise<AudioBuffer | null>;
  stopTTS: () => void;
}

export const useTTS = (): UseTTSReturn => {
  const [ttsAudioLevel, setTtsAudioLevel] = useState(0);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  
  const audioQueue = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const visualizerDataArray = useRef<Uint8Array | null>(null);
  const animationFrame = useRef<number | null>(null);

  const initAudioContext = useCallback(async () => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 44100
      });
      
      analyser.current = audioContext.current.createAnalyser();
      analyser.current.fftSize = 256;
      visualizerDataArray.current = new Uint8Array(analyser.current.frequencyBinCount);
    } else if (audioContext.current.state === 'suspended') {
      await audioContext.current.resume();
    }
    return audioContext.current;
  }, []);

  const updateVisualizer = useCallback(() => {
    if (!analyser.current || !visualizerDataArray.current) return;
    
    analyser.current.getByteFrequencyData(visualizerDataArray.current);
    
    let sum = 0;
    for (let i = 0; i < visualizerDataArray.current.length; i++) {
      sum += visualizerDataArray.current[i];
    }
    const average = sum / visualizerDataArray.current.length;
    setTtsAudioLevel(average);
    
    if (isPlayingRef.current) {
      animationFrame.current = requestAnimationFrame(updateVisualizer);
    } else {
      if (average > 0) {
        setTtsAudioLevel(prev => Math.max(0, prev * 0.9));
        animationFrame.current = requestAnimationFrame(updateVisualizer);
      } else {
        setTtsAudioLevel(0);
      }
    }
  }, []);

  const playNextInQueue = useCallback(() => {
    if (isPlayingRef.current || audioQueue.current.length === 0) {
      if (audioQueue.current.length === 0) {
        isPlayingRef.current = false;
        setIsPlayingTTS(false);
      }
      return;
    }
    
    isPlayingRef.current = true;
    setIsPlayingTTS(true);

    const audioBuffer = audioQueue.current.shift();
    if (!audioBuffer || !audioContext.current) {
      isPlayingRef.current = false;
      setIsPlayingTTS(false);
      return;
    }
    
    try {
      const source = audioContext.current.createBufferSource();
      source.buffer = audioBuffer;
      
      if (analyser.current) {
        source.connect(analyser.current);
        analyser.current.connect(audioContext.current.destination);
        updateVisualizer();
      } else {
        source.connect(audioContext.current.destination);
      }
      
      source.onended = () => {
        isPlayingRef.current = false;
        playNextInQueue();
      };
      
      source.start();
    } catch (err) {
      console.error('Error playing TTS audio:', err);
      isPlayingRef.current = false;
      setIsPlayingTTS(false);
      setTimeout(playNextInQueue, 50);
    }
  }, [updateVisualizer]);

  const processTTSStream = useCallback(async (
    text: string,
    language: string,
    voiceId: string,
    returnFullBuffer = false
  ): Promise<AudioBuffer | null> => {
    const context = await initAudioContext();
    if (!context) return null;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, language, voiceId }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`TTS API request failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      let accumulatedSamples = new Float32Array(0);
      
      if (!returnFullBuffer) {
        audioQueue.current = [];
        isPlayingRef.current = false;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (returnFullBuffer && accumulatedSamples.length > 0) {
            const finalBuffer = context.createBuffer(
              1,
              accumulatedSamples.length,
              context.sampleRate
            );
            finalBuffer.getChannelData(0).set(accumulatedSamples);
            return finalBuffer;
          }
          break;
        }
        
        if (value) {
          const float32Array = new Float32Array(value.buffer, value.byteOffset, value.byteLength / 4);
          
          if (returnFullBuffer) {
            const newBuffer = new Float32Array(accumulatedSamples.length + float32Array.length);
            newBuffer.set(accumulatedSamples, 0);
            newBuffer.set(float32Array, accumulatedSamples.length);
            accumulatedSamples = newBuffer;
          } else {
            const audioBuffer = context.createBuffer(1, float32Array.length, context.sampleRate);
            audioBuffer.getChannelData(0).set(float32Array);
            audioQueue.current.push(audioBuffer);
            playNextInQueue();
          }
        }
      }
      
      return null;
    } catch (err) {
      console.error('Error in TTS processing:', err);
      throw err;
    }
  }, [initAudioContext, playNextInQueue]);

  const playTTS = useCallback(async (text: string, language: string, voiceId: string) => {
    await processTTSStream(text, language, voiceId, false);
  }, [processTTSStream]);

  const playTTSForVideo = useCallback(async (text: string, language: string, voiceId: string) => {
    return processTTSStream(text, language, voiceId, true);
  }, [processTTSStream]);

  const stopTTS = useCallback(() => {
    audioQueue.current = [];
    isPlayingRef.current = false;
    setIsPlayingTTS(false);
    setTtsAudioLevel(0);
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
  }, []);

  return {
    ttsAudioLevel,
    isPlayingTTS,
    playTTS,
    playTTSForVideo,
    stopTTS,
  };
};