class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
        if (this.bufferIndex >= this.bufferSize) {
          this.port.postMessage(this.buffer);
          this.buffer = new Int16Array(this.bufferSize);
          this.bufferIndex = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
