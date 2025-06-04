'use client';

import React, { useState, useRef, useEffect } from 'react';

interface VideoPlayerProps {
  onVideoFileChange: (file: File) => void;
  videoSrcProp?: string;
  dubbedAudioBuffer?: AudioBuffer | null;
  isProcessing?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  onVideoFileChange,
  videoSrcProp,
  dubbedAudioBuffer,
  isProcessing = false,
}) => {
  const [internalVideoSrc, setInternalVideoSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoKey, setVideoKey] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dubbedAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        if (file.size > 100 * 1024 * 1024) {
          setError('File is too large. Please select a video under 100MB.');
          setInternalVideoSrc(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          return;
        }
        const url = URL.createObjectURL(file);
        setInternalVideoSrc(url);
        setVideoKey(prev => prev + 1);
        onVideoFileChange(file);
      } else {
        setError('Invalid file type. Please select a video file.');
        setInternalVideoSrc(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  useEffect(() => {
    const currentSrc = internalVideoSrc;
    return () => {
      if (currentSrc && currentSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentSrc);
      }
    };
  }, [internalVideoSrc]);

  useEffect(() => {
    if (videoSrcProp && videoSrcProp !== internalVideoSrc) {
      setInternalVideoSrc(videoSrcProp);
      setVideoKey(prev => prev + 1);
    }
  }, [videoSrcProp, internalVideoSrc]);

  const playDubbedAudio = async () => {
    if (!videoRef.current || !dubbedAudioBuffer) {
      setError("Dubbed audio not ready or video not loaded.");
      return;
    }

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioCtx = audioContextRef.current;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      if (dubbedAudioSourceRef.current) {
        try {
          dubbedAudioSourceRef.current.stop();
        } catch (e) {
          console.warn("Error stopping previous audio source:", e);
        }
        dubbedAudioSourceRef.current.disconnect();
      }

      const source = audioCtx.createBufferSource();
      source.buffer = dubbedAudioBuffer;
      source.connect(audioCtx.destination);
      
      videoRef.current.muted = true;
      videoRef.current.currentTime = 0;
      
      await videoRef.current.play();
      source.start();
      
      dubbedAudioSourceRef.current = source;

      source.onended = () => {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        dubbedAudioSourceRef.current = null;
      };
    } catch (err) {
      console.error("Error playing dubbed audio:", err);
      setError("Could not play dubbed audio. Please try again.");
    }
  };

  const currentDisplaySrc = internalVideoSrc || videoSrcProp;

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Video Container */}
      <div className="relative bg-gray-100 dark:bg-black rounded-2xl overflow-hidden shadow-lg min-h-[400px] sm:min-h-[500px] flex items-center justify-center">
        {/* Upload Button Overlay when no video */}
        {!currentDisplaySrc && (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
            <div className="text-center">
              <svg
                className="mx-auto h-20 w-20 sm:h-24 sm:w-24 text-gray-400 dark:text-gray-600 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M8 4h8a1 1 0 011 1v14a1 1 0 01-1 1H8a1 1 0 01-1-1V5a1 1 0 011-1z"
                />
              </svg>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="hidden"
                id="video-upload"
                ref={fileInputRef}
              />
              <label
                htmlFor="video-upload"
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg
                         hover:bg-blue-700 cursor-pointer transition-all duration-200 transform hover:scale-105 shadow-lg"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Video
              </label>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">MP4, WebM, or OGG (max 100MB)</p>
            </div>
          </div>
        )}

        {/* Video Element */}
        {currentDisplaySrc && (
          <video
            key={videoKey}
            ref={videoRef}
            src={currentDisplaySrc}
            controls
            className="w-full aspect-video"
          />
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-flex items-center px-4 py-2 bg-gray-800 rounded-lg">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-white">Processing video...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls Below Video */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {currentDisplaySrc && (
          <>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
              id="video-replace"
            />
            <label
              htmlFor="video-replace"
              className="inline-flex items-center px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg
                       hover:bg-gray-600 cursor-pointer transition-colors duration-200"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Replace Video
            </label>
          </>
        )}
        
        {dubbedAudioBuffer && (
          <button
            onClick={playDubbedAudio}
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg
                     hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                     transition-colors duration-200"
            disabled={!dubbedAudioBuffer || dubbedAudioBuffer.length === 0}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Play with Dubbed Audio
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900 dark:bg-opacity-20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;