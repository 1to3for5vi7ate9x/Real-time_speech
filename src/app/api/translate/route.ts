import { NextResponse } from 'next/server';
import * as deepl from 'deepl-node';
import {Translate} from '@google-cloud/translate/build/src/v2';

export async function POST(request: Request) {
  try {
    const { text, targetLang } = await request.json();

    if (!text || !targetLang) {
      return NextResponse.json({ error: 'Missing text or targetLang parameters.' }, { status: 400 });
    }

    let translatedTextResult: string | undefined;
    const lowerTargetLang = targetLang.toLowerCase();

    // Use Google Translate for Hindi, DeepL for others
    if (lowerTargetLang === 'hi') {
      // Ensure GOOGLE_APPLICATION_CREDENTIALS is set in your environment for this to work easily.
      // Or, if using an API key directly with @google-cloud/translate, the setup might be:
      // const translate = new Translate({ key: process.env.GOOGLE_TRANSLATE_API_KEY });
      // For now, assuming ADC (Application Default Credentials) via GOOGLE_APPLICATION_CREDENTIALS.
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_TRANSLATE_API_KEY) {
         console.error('[API/Translate] Google Translate credentials (GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_TRANSLATE_API_KEY) are not set.');
         return NextResponse.json({ error: 'Google Translate credentials not configured on server.' }, { status: 500 });
      }
      
      const translate = new Translate(); // Uses ADC. For API key: new Translate({ key: process.env.GOOGLE_TRANSLATE_API_KEY })

      console.log(`[API/Translate] Translating to Hindi (Google): "${text}"`);
      const [translation] = await translate.translate(text, lowerTargetLang);
      translatedTextResult = translation;
      console.log(`[API/Translate] Google Translation result: "${translatedTextResult}"`);

    } else {
      // Use DeepL for other languages
      const deepLApiKey = process.env.DEEPL_API_KEY;
      if (!deepLApiKey || deepLApiKey === 'your_deepl_api_key_here') {
        console.error('[API/Translate] DEEPL_API_KEY is not set or is a placeholder.');
        return NextResponse.json({ error: 'DeepL API key not configured on server.' }, { status: 500 });
      }

      const translator = new deepl.Translator(deepLApiKey);
      // DeepL specific language codes (generally lowercase or region-specific like 'en-US')
      const langMap: { [key: string]: deepl.TargetLanguageCode } = {
        'en': 'en-US',
        'es': 'es',
        'fr': 'fr',
        'ja': 'ja',
        'de': 'de',
      };
      const deepLTargetCode = langMap[lowerTargetLang];

      if (!deepLTargetCode) {
        // Fallback for codes not in map but potentially supported by DeepL (e.g. if they add new ones)
        // Or handle as error if strict mapping is required.
        console.warn(`[API/Translate] Language code "${lowerTargetLang}" not in explicit DeepL map, trying directly.`);
        // For codes like 'pt', 'it', etc. that DeepL supports but might not be in our small map.
        // The cast here assumes the string is a valid code for DeepL.
        const directCode = lowerTargetLang as deepl.TargetLanguageCode;
        console.log(`[API/Translate] Translating to ${directCode.toUpperCase()} (DeepL Direct): "${text}"`);
        const result = await translator.translateText(text, null, directCode);
        translatedTextResult = Array.isArray(result) ? result[0].text : result.text;
      } else {
        console.log(`[API/Translate] Translating to ${deepLTargetCode.toUpperCase()} (DeepL Mapped): "${text}"`);
        const result = await translator.translateText(text, null, deepLTargetCode);
        translatedTextResult = Array.isArray(result) ? result[0].text : result.text;
      }
      console.log(`[API/Translate] DeepL Translation result: "${translatedTextResult}"`);
    }

    if (typeof translatedTextResult === 'string') {
      return NextResponse.json({ translatedText: translatedTextResult });
    } else {
      throw new Error('Translation result was undefined or not a string.');
    }

  } catch (error: any) {
    console.error('[API/Translate] Error translating text:', error);
    let errorMessage = 'Failed to translate text.';
     if (error instanceof deepl.DeepLError) {
        errorMessage = `DeepL Error: ${error.message}`;
        if (error instanceof deepl.QuotaExceededError) {
            return NextResponse.json({ error: 'DeepL API quota exceeded.' }, { status: 429 });
        }
    } else if (error.message) { // General error or Google Translate error
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}