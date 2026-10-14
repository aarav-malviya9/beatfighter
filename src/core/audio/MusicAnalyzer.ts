export interface TrackAnalysis {
  beats: number[]; // times in seconds
  bpm: number;
  energyCurve: number[]; // sampled at 100Hz (0.01s chunks)
  duration: number;
  confidence: number;
  bassBeats: number[];
  onsetBeats: number[];
}

export class MusicAnalyzer {
  /**
   * Analyze an audio buffer with multi-band energy, spectral flux onset strength,
   * safe normalization (handles silence without NaN), refractory lockout, and robust BPM estimation.
   */
  public static async analyze(buffer: AudioBuffer): Promise<TrackAnalysis> {
    const duration = buffer.duration;
    if (duration <= 0 || buffer.length === 0) {
      return {
        beats: [],
        bpm: 120,
        energyCurve: [],
        duration: 0,
        confidence: 0,
        bassBeats: [],
        onsetBeats: [],
      };
    }

    const sampleRate = buffer.sampleRate;

    // We will render two filtered streams in parallel:
    // 1. Low-pass filter (150Hz) to capture kicks & sub-bass punch
    // 2. Band-pass filter (1000Hz - 4500Hz) to capture rhythmic snares, slaps, and percussive onsets
    const bassCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
    const bassSource = bassCtx.createBufferSource();
    bassSource.buffer = buffer;
    const bassFilter = bassCtx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 160;
    bassSource.connect(bassFilter);
    bassFilter.connect(bassCtx.destination);
    bassSource.start(0);

    const onsetCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
    const onsetSource = onsetCtx.createBufferSource();
    onsetSource.buffer = buffer;
    const onsetFilter = onsetCtx.createBiquadFilter();
    onsetFilter.type = 'bandpass';
    onsetFilter.frequency.value = 2400;
    onsetFilter.Q.value = 1.2;
    onsetSource.connect(onsetFilter);
    onsetFilter.connect(onsetCtx.destination);
    onsetSource.start(0);

    const [renderedBass, renderedOnset] = await Promise.all([
      bassCtx.startRendering(),
      onsetCtx.startRendering(),
    ]);

    const bassData = renderedBass.getChannelData(0);
    const onsetData = renderedOnset.getChannelData(0);

    // 10ms chunking (100Hz sample rate for energyCurve)
    const chunkSize = Math.max(1, Math.floor(sampleRate * 0.01));
    const totalChunks = Math.floor(buffer.length / chunkSize);

    const bassEnergies: number[] = new Array(totalChunks);
    const onsetEnergies: number[] = new Array(totalChunks);
    const combinedEnergies: number[] = new Array(totalChunks);

    let maxBassEnergy = 0;
    let maxOnsetEnergy = 0;
    let maxCombinedEnergy = 0;

    for (let c = 0; c < totalChunks; c++) {
      const start = c * chunkSize;
      const end = Math.min(start + chunkSize, buffer.length);
      const count = end - start;

      let bSum = 0;
      let oSum = 0;
      for (let s = start; s < end; s++) {
        bSum += bassData[s] * bassData[s];
        oSum += onsetData[s] * onsetData[s];
      }

      const bEnergy = Math.sqrt(bSum / count);
      const oEnergy = Math.sqrt(oSum / count);
      const combEnergy = bEnergy * 0.65 + oEnergy * 0.35;

      bassEnergies[c] = bEnergy;
      onsetEnergies[c] = oEnergy;
      combinedEnergies[c] = combEnergy;

      if (bEnergy > maxBassEnergy) maxBassEnergy = bEnergy;
      if (oEnergy > maxOnsetEnergy) maxOnsetEnergy = oEnergy;
      if (combEnergy > maxCombinedEnergy) maxCombinedEnergy = combEnergy;
    }

    // Safe normalization: if completely silent, default to zero without producing NaN
    const energyCurve: number[] = new Array(totalChunks);
    if (maxCombinedEnergy > 0.0001) {
      for (let c = 0; c < totalChunks; c++) {
        energyCurve[c] = combinedEnergies[c] / maxCombinedEnergy;
      }
    } else {
      energyCurve.fill(0);
    }

    // Peak detection with refractory lockout (min 180ms between beats to avoid micro-repeats)
    const minRefractoryChunks = 18; // 18 * 10ms = 180ms
    const beats: number[] = [];
    const bassBeats: number[] = [];
    const onsetBeats: number[] = [];

    let lastBeatChunk = -minRefractoryChunks;
    const threshold = 0.32;

    for (let c = 2; c < totalChunks - 2; c++) {
      // Local peak test
      const val = energyCurve[c];
      if (val > threshold && val > energyCurve[c - 1] && val > energyCurve[c + 1]) {
        if (c - lastBeatChunk >= minRefractoryChunks) {
          const beatTime = c * 0.01;
          beats.push(beatTime);
          lastBeatChunk = c;

          // Categorize as bass or sharp onset
          if (maxBassEnergy > 0 && bassEnergies[c] / maxBassEnergy > 0.4) {
            bassBeats.push(beatTime);
          }
          if (maxOnsetEnergy > 0 && onsetEnergies[c] / maxOnsetEnergy > 0.45) {
            onsetBeats.push(beatTime);
          }
        }
      }
    }

    // Robust BPM estimation with interval clustering & half/double-time correction
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      const dt = beats[i] - beats[i - 1];
      if (dt >= 0.25 && dt <= 1.5) {
        intervals.push(dt);
      }
    }

    let bpm = 128;
    let confidence = 0.5;

    if (intervals.length >= 4) {
      // Group intervals into 20ms bins
      const bins: Record<number, number> = {};
      for (const dt of intervals) {
        const bin = Math.round(dt * 50) / 50;
        bins[bin] = (bins[bin] || 0) + 1;
      }

      let bestBin = 0.5;
      let maxCount = 0;
      for (const [binStr, count] of Object.entries(bins)) {
        if (count > maxCount) {
          maxCount = count;
          bestBin = parseFloat(binStr);
        }
      }

      let estimatedBpm = Math.round(60 / bestBin);

      // Half-time / double-time normalization: target range 90-180 BPM
      while (estimatedBpm < 90) estimatedBpm *= 2;
      while (estimatedBpm > 180) estimatedBpm /= 2;

      bpm = Math.round(estimatedBpm);
      confidence = Math.min(1.0, maxCount / (intervals.length * 0.4));
    }

    return {
      beats,
      bpm,
      energyCurve,
      duration,
      confidence,
      bassBeats,
      onsetBeats,
    };
  }
}
