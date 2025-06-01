# Real-Time Speech Translation & Text-to-Speech POC

## Project Overview

Building a functional demonstration of real-time speech translation capabilities with voice cloning, targeting sub-100ms latency for live commentary translation.

### Key Features
- Real-time English speech-to-text using AssemblyAI
- Instant translation to multiple languages
- Text-to-speech with cloned announcer voice using Cartesia Sonic
- Interactive language switching
- Latency monitoring and display

## Technical Stack

### Core Technologies
- **Frontend**: Next.js (React framework with API routes)
- **ASR**: AssemblyAI Streaming API
- **Translation**: DeepL or Google Translate API
- **TTS**: Cartesia Sonic (with voice cloning)
- **Real-time Communication**: WebSockets

### Architecture Components
1. **Client Side**: Next.js web application with video player
2. **Edge Infrastructure**: Next.js backend (simulated edge node)
3. **External APIs**: AssemblyAI, Translation service, Cartesia Sonic

## 7-Day Development Timeline

### Day 1: Setup & Basic ASR Integration
**Focus: Frontend & ASR Integration**

#### Tasks
- [ ] Create new Next.js project
- [ ] Set up basic video player component
- [ ] Get AssemblyAI free tier API key
- [ ] Implement WebSocket connection to AssemblyAI streaming ASR
- [ ] Display English transcription in real-time
- [ ] Test English audio transcription accuracy

#### Code Setup
```bash
npx create-next-app@latest speech-translation-poc
cd speech-translation-poc
npm install ws assemblyai
```

#### Key Files to Create
- `pages/index.js` - Main demo page
- `pages/api/asr.js` - AssemblyAI WebSocket handler
- `components/VideoPlayer.js` - Video player component
- `components/TranscriptionDisplay.js` - Text display component

---

### Day 2: Voice Cloning & TTS Integration
**Focus: TTS Integration**

#### Tasks
- [ ] Get Cartesia Sonic free tier API key
- [ ] Record 3-5 seconds of English announcer voice sample
- [ ] Implement voice cloning process to get "Cloned Announcer Voice ID"
- [ ] Create basic TTS integration with cloned voice
- [ ] Test TTS quality and voice similarity
- [ ] Implement quality check workflow

#### Voice Cloning Process
1. Upload announcer audio sample to Cartesia Sonic
2. Wait for voice model training completion
3. Receive unique Voice ID
4. Test voice quality with sample text
5. Store Voice ID for production use

#### Key Files to Create
- `pages/api/voice-clone.js` - Voice cloning API endpoint
- `pages/api/tts.js` - Text-to-speech API endpoint
- `utils/cartesia.js` - Cartesia SDK utilities

---

### Day 3: Full Pipeline Integration
**Focus: ASR + Translation + TTS Chain**

#### Tasks
- [ ] Choose and set up Translation API (DeepL recommended)
- [ ] Chain all services together:
  - AssemblyAI (English text) → Translation API → Cartesia TTS
- [ ] Implement streaming pipeline in Next.js API route
- [ ] Configure AssemblyAI for unformatted output (raw text without punctuation)
- [ ] Test complete pipeline with one target language
- [ ] Optimize audio chunking for minimal latency

#### Pipeline Flow
```
Audio Input → AssemblyAI → Unformatted English Text → 
Translation API → Translated Text → Cartesia TTS (with Voice ID) → 
Translated Audio Output
```

#### Key Files to Create
- `pages/api/translate.js` - Translation service integration
- `pages/api/pipeline.js` - Main processing pipeline
- `utils/translation.js` - Translation utilities

---

### Day 4: Interactive Language Switching
**Focus: Multi-language Support & UI**

#### Tasks
- [ ] Implement language selection UI with buttons
- [ ] Add support for 2-3 target languages (Spanish, French)
- [ ] Update backend to handle dynamic language switching
- [ ] Implement real-time language toggle without interruption
- [ ] Test seamless switching between languages
- [ ] Add visual feedback for active language

#### Supported Languages (Initial)
- Spanish (es)
- French (fr)
- German (de) - optional

#### Key Files to Update
- `components/LanguageSelector.js` - Language selection UI
- `pages/api/pipeline.js` - Dynamic language parameter handling

---

### Day 5: Latency Optimization & Monitoring
**Focus: Performance & Metrics**

#### Tasks
- [ ] Implement latency measurement in backend
- [ ] Track time from audio input to translated audio output
- [ ] Display real-time latency metrics in UI
- [ ] Optimize audio chunking strategies
- [ ] Target sub-100ms average latency
- [ ] Add performance monitoring dashboard

#### Latency Targets
- **Target**: < 100ms average end-to-end latency
- **Acceptable**: < 200ms for POC demonstration
- **Components to measure**:
  - ASR processing time
  - Translation API response time
  - TTS generation time
  - Network transmission time

#### Key Files to Create
- `components/LatencyMonitor.js` - Real-time latency display
- `utils/performance.js` - Performance measurement utilities

---

### Day 6: Demo Preparation & Polish
**Focus: User Experience & Error Handling**

#### Tasks
- [ ] Add basic error handling for all API calls
- [ ] Implement graceful failure modes
- [ ] Polish UI for presentation readiness
- [ ] Add loading states and user feedback
- [ ] Test on presentation hardware
- [ ] Prepare demo script and talking points
- [ ] Create backup plans for API failures

#### Error Handling Scenarios
- ASR service unavailable
- Translation API rate limits
- TTS service failures
- Network connectivity issues
- Audio input problems

---

### Day 7: Final Testing & Contingency
**Focus: Production Readiness**

#### Tasks
- [ ] Complete end-to-end testing on target hardware
- [ ] Validate all language combinations
- [ ] Test with different audio sources
- [ ] Prepare contingency plans and backups
- [ ] Document any known limitations
- [ ] Prepare results presentation and future roadmap

## Environment Setup

### Required API Keys
```bash
# .env.local
ASSEMBLYAI_API_KEY=your_assemblyai_key
CARTESIA_API_KEY=your_cartesia_key
DEEPL_API_KEY=your_deepl_key
# or GOOGLE_TRANSLATE_API_KEY=your_google_key
```

### Installation Commands
```bash
npm install assemblyai deepl-node ws
# or for Google Translate
npm install @google-cloud/translate
```

## Important Considerations

### API Rate Limits
- **AssemblyAI**: Monitor free tier limits for streaming
- **Translation APIs**: Be mindful of character limits
- **Cartesia Sonic**: Track voice generation quotas
- Keep test clips short during development

### Technical Notes
- Focus on **unformatted text** from ASR for better translation accuracy
- Streaming ASR may compromise formatting for speed - this is expected
- Voice cloning quality depends on source audio quality
- WebSocket connections need proper error handling and reconnection logic

### Performance Optimization
- Implement audio chunking strategies
- Consider parallel processing where possible
- Optimize WebSocket message sizes
- Cache translated phrases for common expressions

## Success Metrics

### Functional Requirements
- [ ] Real-time English speech recognition
- [ ] Accurate translation to target languages
- [ ] High-quality voice cloning and TTS
- [ ] Interactive language switching
- [ ] Sub-200ms latency (target: sub-100ms)

### Demo Requirements
- [ ] Smooth presentation flow
- [ ] Clear audio quality
- [ ] Responsive UI interactions
- [ ] Reliable error recovery
- [ ] Professional appearance

## Future Enhancements (Post-POC)

### Potential Additions
- Support for additional languages
- Real-time accent/dialect detection
- Custom vocabulary for sports terminology
- Multiple announcer voice profiles
- Advanced noise cancellation
- Mobile app version
- Cloud deployment optimization

### Scalability Considerations
- CDN integration for global deployment
- Load balancing for high traffic
- Advanced caching strategies
- Microservices architecture
- Real-time analytics dashboard

---

## Getting Started

1. Clone or create the Next.js project
2. Set up all required API accounts and keys
3. Follow the day-by-day timeline
4. Test each component thoroughly before moving to the next
5. Keep the focus on functionality over aesthetics for the POC
6. Document any issues or limitations encountered

**Remember**: This is a "very simple version" POC - prioritize working functionality over perfect polish!