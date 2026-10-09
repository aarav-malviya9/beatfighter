export interface TrackAnalysis {
  beats: number[]; // times in seconds
  bpm: number;
  energyCurve: number[]; // sampled at e.g. 10Hz
  duration: number;
}

export class MusicAnalyzer {
  public static async analyze(buffer: AudioBuffer): Promise<TrackAnalysis> {
    const offlineCtx = new OfflineAudioContext(
      1, 
      buffer.length, 
      buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    // Filter to isolate bass/kick drums for beat detection
    const lowpass = offlineCtx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 150;

    source.connect(lowpass);
    lowpass.connect(offlineCtx.destination);
    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    const data = renderedBuffer.getChannelData(0);

    const beats: number[] = [];
    const energyCurve: number[] = [];
    const sampleRate = renderedBuffer.sampleRate;
    
    // Process in chunks to find peaks (e.g. 10ms chunks)
    const chunkSize = Math.floor(sampleRate * 0.01);
    let maxEnergy = 0;
    
    // First pass: build energy curve
    for (let i = 0; i < data.length; i += chunkSize) {
      let sum = 0;
      for (let j = 0; j < chunkSize && i + j < data.length; j++) {
        sum += data[i + j] * data[i + j];
      }
      const energy = Math.sqrt(sum / chunkSize);
      energyCurve.push(energy);
      if (energy > maxEnergy) maxEnergy = energy;
    }

    // Normalize energy curve and detect peaks
    let inPeak = false;
    let peakStart = 0;

    for (let i = 0; i < energyCurve.length; i++) {
      energyCurve[i] /= maxEnergy; // Normalize to 0-1

      if (energyCurve[i] > 0.4) { 
        if (!inPeak) {
          inPeak = true;
          peakStart = i;
        }
      } else {
        if (inPeak) {
          inPeak = false;
          // Find max within the peak window
          let localMax = 0;
          let maxIdx = peakStart;
          for (let p = peakStart; p < i; p++) {
            if (energyCurve[p] > localMax) {
              localMax = energyCurve[p];
              maxIdx = p;
            }
          }
          beats.push(maxIdx * 0.01); // convert chunk index to seconds
        }
      }
    }

    // Estimate BPM using interval histograms
    const intervals: Record<string, number> = {};
    for (let i = 1; i < beats.length; i++) {
      const interval = beats[i] - beats[i - 1];
      // Ignore intervals that are too fast or too slow (e.g., > 200BPM or < 60BPM)
      if (interval > 0.3 && interval < 1.0) {
        const bucket = Math.round(interval * 10) / 10;
        intervals[bucket] = (intervals[bucket] || 0) + 1;
      }
    }

    let likelyInterval = 0.5;
    let maxCount = 0;
    for (const [interval, count] of Object.entries(intervals)) {
      if (count > maxCount) {
        maxCount = count;
        likelyInterval = parseFloat(interval);
      }
    }

    const bpm = Math.round(60 / likelyInterval) || 120;

    return {
      beats,
      bpm,
      energyCurve,
      duration: buffer.duration
    };
  }
}
