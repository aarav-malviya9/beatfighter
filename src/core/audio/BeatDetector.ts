export class BeatDetector {
  private bufferSize: number = 256;
  private energyHistory: number[] = [];
  private historySize: number = 43; // About 1 second of frames at 60fps

  public isBeat(frequencyData: Uint8Array): boolean {
    if (frequencyData.length === 0) return false;

    // Calculate current energy (average of lower frequencies for bass/beats)
    let currentEnergy = 0;
    // Focus on lower bins (bass)
    const subBassBins = Math.floor(this.bufferSize * 0.1); 
    for (let i = 0; i < subBassBins; i++) {
      currentEnergy += frequencyData[i];
    }
    currentEnergy /= subBassBins;

    // Calculate local average energy
    let localAverageEnergy = 0;
    for (let i = 0; i < this.energyHistory.length; i++) {
      localAverageEnergy += this.energyHistory[i];
    }
    if (this.energyHistory.length > 0) {
      localAverageEnergy /= this.energyHistory.length;
    } else {
      localAverageEnergy = currentEnergy; // First frame
    }

    // Push to history
    this.energyHistory.push(currentEnergy);
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }

    // Variance for dynamic threshold
    let variance = 0;
    for (let i = 0; i < this.energyHistory.length; i++) {
      variance += Math.pow(this.energyHistory[i] - localAverageEnergy, 2);
    }
    variance /= this.energyHistory.length;
    
    // Dynamic threshold based on variance (magic formula from audio processing heuristics)
    const c = -0.0025714 * variance + 1.5142857;
    
    return currentEnergy > localAverageEnergy * c && currentEnergy > 50; 
  }
}
