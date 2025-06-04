# Real-Time Speech Translation and Video Dubbing POC

This is a [Next.js](https://nextjs.org/) project demonstrating a Proof of Concept (POC) for real-time speech-to-text (STT), translation, and text-to-speech (TTS) capabilities, along with video file processing for dubbed audio playback with synchronized subtitles.

## Features

### 🎥 Video Processing
*   **Upload & Process:** Support for MP4, WebM, and OGG video formats (max 100MB)
*   **Automatic Transcription:** Real-time speech-to-text using AssemblyAI with word-level timestamps
*   **Multi-language Translation:** Supports Spanish, French, Hindi, Japanese, and German
*   **AI Dubbing:** Generates natural-sounding dubbed audio using Cartesia AI voices
*   **Synchronized Subtitles:** Displays original English subtitles synchronized with dubbed audio playback
*   **Smart Processing:** Handles videos up to 30 seconds with optimized chunking for complete transcription

### 🎤 Live Microphone Input
*   **Real-time Transcription:** Live speech-to-text conversion with partial and final transcripts
*   **Instant Translation:** Translates speech as you talk
*   **Audio Visualization:** Visual feedback for microphone input levels
*   **TTS Playback:** Play translated audio for the last spoken segment

### 🌐 Translation Services
*   **DeepL Integration:** High-quality translations for European and Asian languages
*   **Google Translate:** Specialized support for Hindi translation
*   **Chunked Processing:** Intelligently splits long texts (>3000 chars) into sentences for accurate translation

### 🔊 Text-to-Speech
*   **Cartesia AI Voices:** Natural-sounding voices in multiple languages
*   **Automatic Voice Selection:** Chooses appropriate voice based on language and gender preferences
*   **Streaming Playback:** Low-latency audio streaming for responsive feedback
*   **Full Audio Buffer Generation:** Creates complete dubbed audio tracks for video synchronization

## Core Technologies Used

*   **Frontend:** Next.js 14 (React), TypeScript, Tailwind CSS
*   **Speech-to-Text (ASR):** AssemblyAI (real-time WebSocket API)
*   **Translation:** DeepL API and Google Cloud Translation API
*   **Text-to-Speech (TTS):** Cartesia API (streaming audio generation)
*   **Audio Processing:** Web Audio API for capture, resampling, and playback
*   **Backend:** Custom Node.js server with WebSocket support

## Project Structure

```
Disney_poc/
├── src/
│   ├── app/
│   │   ├── api/              # API routes
│   │   │   ├── translate/    # Translation endpoint
│   │   │   ├── tts/         # Text-to-Speech endpoint
│   │   │   └── voices/      # Voice listing endpoint
│   │   ├── page.tsx         # Main application page
│   │   ├── layout.tsx       # Root layout
│   │   └── globals.css      # Global styles
│   ├── components/
│   │   ├── VideoPlayer.tsx  # Video upload and playback
│   │   ├── Subtitles.tsx    # Subtitle synchronization
│   │   ├── TranscriptionDisplay.tsx  # Live transcription
│   │   ├── TranslationDisplay.tsx    # Translation display
│   │   ├── LanguageSelector.tsx      # Language dropdown
│   │   └── AudioVisualizer.tsx       # Audio level display
│   └── hooks/               # Custom React hooks
│       ├── useWebSocket.ts  # WebSocket management
│       ├── useAudioRecording.ts  # Microphone handling
│       ├── useTranslation.ts     # Translation logic
│       └── useTTS.ts            # TTS management
├── server.js               # WebSocket server for ASR
├── package.json           # Dependencies
├── tsconfig.json         # TypeScript config
└── .env.local           # Environment variables
```

## Environment Variables

Create a `.env.local` file in the root of the project with the following variables:

```env
# AssemblyAI API Key (required)
NEXT_PUBLIC_ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here

# DeepL API Key (required for most languages)
DEEPL_API_KEY=your_deepl_api_key_here

# Google Cloud Translation (required for Hindi)
# Option 1: Service Account Credentials
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/google-credentials.json
# Option 2: API Key
GOOGLE_TRANSLATE_API_KEY=your_google_translate_api_key

# Cartesia API Key (required for TTS)
CARTESIA_API_KEY=your_cartesia_api_key_here

# Optional: Custom WebSocket URL (defaults to ws://localhost:3000/ws/asr)
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:3000/ws/asr
```

**Note:** Ensure that API keys with usage costs are properly secured and managed. For production, sensitive keys should ideally not be exposed on the client-side.

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd Disney_poc
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up your API Keys:**
    Create a `.env.local` file in the project root and add your API keys as shown above.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    This starts both the Next.js frontend and the WebSocket server on [http://localhost:3000](http://localhost:3000).

5.  **Open your browser:**
    Navigate to [http://localhost:3000](http://localhost:3000)

6.  **Grant microphone permissions when prompted**

## How It Works

### Microphone Input Flow:
1.  User clicks "Start Recording"
2.  Audio captured at native sample rate using Web Audio API
3.  Audio resampled to 16kHz and converted to PCM16
4.  PCM data streamed via WebSocket to backend server
5.  Server forwards audio to AssemblyAI real-time API
6.  Partial transcripts update UI in real-time
7.  Final transcripts are translated via DeepL/Google API
8.  User can play TTS audio of the translation

### Video Processing Flow:
1.  User uploads video file (MP4/WebM/OGG)
2.  Audio extracted using Web Audio API
3.  Audio chunked into 100ms segments for processing
4.  Each chunk resampled to 16kHz PCM16
5.  Chunks streamed to AssemblyAI with timestamps preserved
6.  Word-level timestamps stored for subtitle synchronization
7.  Complete transcript translated in chunks (3000 char limit)
8.  Full translation sent to Cartesia for TTS generation
9.  User plays video with:
    - Original video (muted)
    - Dubbed audio in target language
    - Synchronized English subtitles

### Technical Details:
- **Audio Processing:** 16kHz sampling rate, 16-bit PCM encoding
- **Chunking:** 100ms audio chunks for optimal ASR performance
- **Translation:** Sentence-aware splitting for context preservation
- **Subtitle Sync:** Word-level timestamps from AssemblyAI
- **Buffering:** Audio queue management for smooth playback

## Key Features Implemented

### Performance Optimizations
- **Chunked Translation:** Long texts split intelligently by sentences
- **Audio Queue Management:** Prevents dropped frames during streaming
- **Debounced Updates:** Reduces unnecessary API calls
- **Optimized Resampling:** Efficient audio downsampling for ASR
- **Session Recovery:** Auto-reconnect WebSocket on disconnection

### User Experience
- **Dark/Light Theme Support:** Automatic theme detection
- **Responsive Design:** Mobile and desktop optimized
- **Real-time Feedback:** Audio level visualizers
- **Progress Indicators:** Processing status for video
- **Error Recovery:** Graceful handling of API failures

## Known Limitations

- Video files must have compatible audio tracks (MP4 with AAC audio works best)
- Maximum video file size: 100MB
- Video duration ideally under 30 seconds for optimal performance
- Some video formats may require server-side audio extraction
- Translation quality varies by language pair
- TTS voice availability depends on target language

## Troubleshooting

### WebSocket Connection Issues
- Ensure server is running on port 3000
- Check firewall settings
- Verify NEXT_PUBLIC_WEBSOCKET_URL in .env.local

### Audio Processing Errors
- Check browser permissions for microphone
- Ensure video has audio track
- Try MP4 format for best compatibility

### Translation Failures
- Verify API keys are set correctly
- Check API quota limits
- Ensure target language is supported

### TTS Issues
- Confirm Cartesia API key is valid
- Check voice availability for language
- Monitor browser console for errors

---

This project is a Next.js application. Standard Next.js "Learn More" and "Deploy on Vercel" sections follow.

## Learn More (Next.js)

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel (Next.js)

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
