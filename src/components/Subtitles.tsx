'use client';

import React, { useEffect, useState } from 'react';

export interface SubtitleWord {
  start: number; // ms
  end: number; // ms
  text: string;
  confidence?: number;
}

interface SubtitlesProps {
  words: SubtitleWord[];
  currentTime: number; // Current playback time in seconds
  isPlaying: boolean;
}

const Subtitles: React.FC<SubtitlesProps> = ({ words, currentTime, isPlaying }) => {
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  
  useEffect(() => {
    if (!isPlaying || !words || words.length === 0) {
      setCurrentSubtitle('');
      return;
    }
    
    // Convert current time from seconds to milliseconds
    const currentTimeMs = currentTime * 1000;
    
    // Find words that should be displayed at current time
    // We'll show a few words at a time for better readability
    const SUBTITLE_DURATION = 3000; // Show subtitles for 3 seconds
    const WORDS_PER_SUBTITLE = 8; // Maximum words to show at once
    
    // Find the current word index
    let currentWordIndex = -1;
    for (let i = 0; i < words.length; i++) {
      if (currentTimeMs >= words[i].start && currentTimeMs <= words[i].end + 500) {
        currentWordIndex = i;
        break;
      }
    }
    
    if (currentWordIndex === -1) {
      // Check if we're between words
      for (let i = 0; i < words.length - 1; i++) {
        if (currentTimeMs >= words[i].end && currentTimeMs < words[i + 1].start) {
          currentWordIndex = i;
          break;
        }
      }
    }
    
    if (currentWordIndex >= 0) {
      // Collect words for current subtitle
      const subtitleWords: string[] = [];
      let startIndex = Math.max(0, currentWordIndex - 2); // Start a bit before current word
      let endIndex = Math.min(words.length - 1, startIndex + WORDS_PER_SUBTITLE - 1);
      
      // Adjust to sentence boundaries if possible
      // Look for punctuation marks to find natural breaks
      for (let i = startIndex; i <= endIndex && i < words.length; i++) {
        subtitleWords.push(words[i].text);
        
        // Stop at sentence endings
        if (words[i].text.match(/[.!?]$/)) {
          break;
        }
      }
      
      setCurrentSubtitle(subtitleWords.join(' '));
    } else {
      setCurrentSubtitle('');
    }
  }, [words, currentTime, isPlaying]);
  
  if (!currentSubtitle) return null;
  
  return (
    <div className="absolute bottom-8 left-0 right-0 flex justify-center px-4 pointer-events-none">
      <div className="bg-black bg-opacity-75 text-white px-6 py-3 rounded-lg max-w-3xl text-center">
        <p className="text-lg sm:text-xl leading-relaxed font-medium drop-shadow-lg">
          {currentSubtitle}
        </p>
      </div>
    </div>
  );
};

export default Subtitles;