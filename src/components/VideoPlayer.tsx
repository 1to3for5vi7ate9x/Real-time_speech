import React, { useState, useRef } from 'react';

interface VideoPlayerProps {
  onVideoFileChange: (file: File) => void;
  videoSrcProp?: string; // Renamed to avoid conflict, this is the URL of the uploaded video
  dubbedAudioBuffer?: AudioBuffer | null;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ onVideoFileChange, videoSrcProp, dubbedAudioBuffer }) => {
  const [internalVideoSrc, setInternalVideoSrc] = useState<string | null>(null); // For Object URL created from file upload
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dubbedAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        if (file.size > 100 * 1024 * 1024) { // 100MB limit
          setError('File is too large. Please select a video under 100MB.');
          setInternalVideoSrc(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset file input
          }
          return;
        }
        const url = URL.createObjectURL(file);
        setInternalVideoSrc(url); // Use internal state for the object URL
        onVideoFileChange(file);
      } else {
        setError('Invalid file type. Please select a video file.');
        setInternalVideoSrc(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = ''; // Reset file input
        }
      }
    }
  };

  // Clean up object URL when component unmounts or videoSrc changes
  React.useEffect(() => {
    const currentSrc = internalVideoSrc; // Use internalVideoSrc for cleanup
    return () => {
      if (currentSrc && currentSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentSrc);
      }
    };
  }, [internalVideoSrc]);

  // Effect to handle externally provided videoSrcProp (e.g. if parent wants to set it)
  // This might be useful if the video source comes from somewhere other than direct upload
  React.useEffect(() => {
    if (videoSrcProp && videoSrcProp !== internalVideoSrc) {
      setInternalVideoSrc(videoSrcProp);
    }
  }, [videoSrcProp, internalVideoSrc]);

  const playDubbedAudio = () => {
    if (videoRef.current && dubbedAudioBuffer) {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('[VideoPlayer] New AudioContext created for dubbed playback.');
      }
      
      const audioCtx = audioContextRef.current;

      // Resume AudioContext if it's suspended (e.g., due to browser auto-play policies)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          console.log('[VideoPlayer] AudioContext resumed for dubbed playback.');
          // Proceed with playback now that context is active
          playAudioWithContext(audioCtx);
        }).catch(err => {
          console.error('[VideoPlayer] Error resuming AudioContext:', err);
          setError('Could not resume audio context. Please interact with the page and try again.');
        });
      } else {
        playAudioWithContext(audioCtx);
      }
    } else {
      console.warn("Video element or dubbed audio buffer not ready.");
      setError("Dubbed audio not ready or video not loaded.");
    }
  };

  // Helper function, defined within the component's scope but outside playDubbedAudio
  const playAudioWithContext = (audioCtx: AudioContext) => {
    if (!videoRef.current || !dubbedAudioBuffer) {
        console.error("[VideoPlayer] playAudioWithContext called with null refs or no dubbed buffer.");
        setError("Cannot play dubbed audio: Missing video or audio data.");
        return;
    }

    if (dubbedAudioSourceRef.current) {
        try {
            dubbedAudioSourceRef.current.stop();
        } catch (e) {
            console.warn("[VideoPlayer] Error stopping previous audio source:", e);
        }
        dubbedAudioSourceRef.current.disconnect();
    }

    const source = audioCtx.createBufferSource();
    source.buffer = dubbedAudioBuffer;
    source.connect(audioCtx.destination);
    
    if(videoRef.current) { // Ensure videoRef.current is not null
        videoRef.current.muted = true;
        videoRef.current.currentTime = 0;
        
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
            playPromise.then(_ => {
                source.start();
            }).catch(playError => {
                console.error("Error playing video for dubbed playback:", playError);
                setError("Could not start video for dubbed playback.");
                // Attempt to stop the audio source if video fails to play
                try { source.stop(); } catch(e) { console.warn("Error stopping audio source after video play failure", e); }
            });
        } else {
            source.start();
        }
    } else {
        console.error("[VideoPlayer] videoRef.current is null in playAudioWithContext after check.");
        setError("Video element not available for playback.");
        return;
    }

    dubbedAudioSourceRef.current = source;

    source.onended = () => {
        if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
        }
        dubbedAudioSourceRef.current = null;
    };
  };
  
  const currentDisplaySrc = internalVideoSrc || videoSrcProp;

  return (
    <div className="w-full md:w-2/3 lg:w-1/2 mx-auto flex flex-col items-center gap-4">
      <input
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        ref={fileInputRef}
        className="block w-full text-sm text-slate-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-full file:border-0
          file:text-sm file:font-semibold
          file:bg-violet-50 file:text-violet-700
          hover:file:bg-violet-100
        "
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {currentDisplaySrc ? (
        <>
          <video ref={videoRef} controls src={currentDisplaySrc} className="w-full aspect-video rounded-lg border border-gray-300">
            Your browser does not support the video tag.
          </video>
          {dubbedAudioBuffer && (
            <button
              onClick={playDubbedAudio}
              className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
            >
              Play with Dubbed Audio
            </button>
          )}
        </>
      ) : (
        <div className="w-full aspect-video bg-gray-200 border border-gray-400 rounded-lg flex items-center justify-center text-sm">
          <p className="text-gray-500">Select a video file to play (max 30s recommended, 100MB limit)</p>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;