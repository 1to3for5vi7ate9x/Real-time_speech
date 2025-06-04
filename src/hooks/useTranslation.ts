import { useState, useCallback } from 'react';

interface UseTranslationReturn {
  translatedText: string;
  isTranslating: boolean;
  translateText: (text: string, targetLang: string) => Promise<string | null>;
  clearTranslation: () => void;
}

export const useTranslation = (): UseTranslationReturn => {
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  const translateText = useCallback(async (text: string, targetLang: string): Promise<string | null> => {
    if (!text.trim()) return null;
    
    setIsTranslating(true);
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang }),
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Translation failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      setTranslatedText(data.translatedText);
      return data.translatedText;
    } catch (err) {
      console.error('Error translating text:', err);
      throw err;
    } finally {
      setIsTranslating(false);
    }
  }, []);

  const clearTranslation = useCallback(() => {
    setTranslatedText('');
  }, []);

  return {
    translatedText,
    isTranslating,
    translateText,
    clearTranslation,
  };
};