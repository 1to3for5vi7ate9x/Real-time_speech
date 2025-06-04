'use client';

import React from 'react';

interface TranscriptionDisplayProps {
  transcription: string | null;
  className?: string;
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({ transcription, className = '' }) => {
  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 sm:p-6 shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-400">Live Transcription</h3>
        {transcription && transcription.trim() && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-500 dark:text-gray-500">Live</span>
          </div>
        )}
      </div>
      <div className="h-32 overflow-y-auto custom-scrollbar">
        <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
          {transcription === null || transcription === undefined
            ? <span className="text-gray-400 dark:text-gray-500 italic">Waiting for transcription...</span>
            : transcription.trim() === ""
            ? <span className="text-gray-400 dark:text-gray-500 italic">Receiving audio, waiting for speech...</span>
            : transcription}
        </p>
      </div>
    </div>
  );
};

export default TranscriptionDisplay;