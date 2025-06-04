import { useRef, useState, useCallback } from 'react';

interface UseAudioRecordingProps {
  onAudioData: (data: ArrayBuffer) => void;
  targetSampleRate?: number;
}

export const useAudioRecording = ({ onAudioData, targetSampleRate = 16000 }: UseAudioRecordingProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const microphoneSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorNode = useRef<ScriptProcessorNode | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) {
      console.log('Already recording.');
      return;
    }

    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } else if (audioContext.current.state === 'suspended') {
        await audioContext.current.resume();
      }
      
      const currentAudioContext = audioContext.current;

      // Audio Visualizer Setup
      if (!analyser.current) {
        analyser.current = currentAudioContext.createAnalyser();
        analyser.current.fftSize = 256;
      }
      if (microphoneSource.current) {
        microphoneSource.current.disconnect();
      }
      microphoneSource.current = currentAudioContext.createMediaStreamSource(mediaStream.current);
      microphoneSource.current.connect(analyser.current);
      
      const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
      const drawVolume = () => {
        if (!isRecordingRef.current || !analyser.current) {
          setAudioLevel(0);
          if (isRecordingRef.current) requestAnimationFrame(drawVolume);
          return;
        }
        analyser.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setAudioLevel(sum / dataArray.length);
        requestAnimationFrame(drawVolume);
      };

      // PCM Audio Processing
      const source = currentAudioContext.createMediaStreamSource(mediaStream.current);
      const sourceSampleRate = currentAudioContext.sampleRate;
      const bufferSize = 4096;

      if (scriptProcessorNode.current) {
        scriptProcessorNode.current.disconnect();
      }
      scriptProcessorNode.current = currentAudioContext.createScriptProcessor(bufferSize, 1, 1);

      let resampleBuffer = new Float32Array(0);

      scriptProcessorNode.current.onaudioprocess = (audioProcessingEvent) => {
        if (!isRecordingRef.current) return;
        
        const inputPcmData = audioProcessingEvent.inputBuffer.getChannelData(0);
        
        const newLength = resampleBuffer.length + inputPcmData.length;
        const tempBuffer = new Float32Array(newLength);
        tempBuffer.set(resampleBuffer, 0);
        tempBuffer.set(inputPcmData, resampleBuffer.length);
        resampleBuffer = tempBuffer;

        const resampleRatio = sourceSampleRate / targetSampleRate;
        const desiredOutputLength = Math.floor(targetSampleRate * 0.250);

        while (resampleBuffer.length >= Math.floor(desiredOutputLength * resampleRatio)) {
          const processableChunk = resampleBuffer.slice(0, Math.floor(desiredOutputLength * resampleRatio));
          resampleBuffer = resampleBuffer.slice(Math.floor(desiredOutputLength * resampleRatio));

          const downsampledPcm = new Float32Array(desiredOutputLength);
          for (let i = 0; i < desiredOutputLength; i++) {
            const correspondingSourceIndex = Math.floor(i * resampleRatio);
            if (correspondingSourceIndex < processableChunk.length) {
              downsampledPcm[i] = processableChunk[correspondingSourceIndex];
            } else {
              downsampledPcm[i] = 0;
            }
          }

          const outputInt16 = new Int16Array(downsampledPcm.length);
          for (let i = 0; i < downsampledPcm.length; i++) {
            const s = Math.max(-1, Math.min(1, downsampledPcm[i]));
            outputInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          onAudioData(outputInt16.buffer);
        }
      };

      source.connect(scriptProcessorNode.current);
      scriptProcessorNode.current.connect(currentAudioContext.destination);

      setIsRecording(true);
      isRecordingRef.current = true;
      requestAnimationFrame(drawVolume);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      throw err;
    }
  }, [onAudioData, targetSampleRate]);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    
    console.log('Stopping recording...');
    isRecordingRef.current = false;
    setIsRecording(false);
    setAudioLevel(0);

    if (scriptProcessorNode.current) {
      scriptProcessorNode.current.disconnect();
      scriptProcessorNode.current = null;
    }
    if (microphoneSource.current) {
      microphoneSource.current.disconnect();
      microphoneSource.current = null;
    }
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }
  }, []);

  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
  };
};