import React from 'react';

interface TranscriptionDisplayProps {
  transcription: string;
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({ transcription }) => {
  return (
    <div className="w-full h-48 bg-gray-100 border border-gray-300 rounded-lg p-4 overflow-y-auto">
      <h2 className="text-lg font-semibold mb-2">Live Transcription</h2>
      {transcription && transcription.trim() !== "" ? (
        <p className="text-gray-700 whitespace-pre-wrap">{transcription}</p>
      ) : (
        <p className="text-gray-500 italic">
          {/* 
            If transcription is an empty string, it means we are getting data 
            (partials are coming in) but no actual text yet.
            If transcription is null/undefined (initial state), it shows "Waiting...".
            The current logic in page.tsx passes finalizedTranscript + currentPartial,
            so it will be an empty string if both are empty.
          */ }
          {transcription === "" ? "Receiving audio, waiting for speech..." : "Waiting for transcription..."}
        </p>
      )}
    </div>
  );
};

export default TranscriptionDisplay;