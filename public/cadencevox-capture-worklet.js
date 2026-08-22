class CadenceVoxCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // frameSize is the interleaved-stereo sample count the encoder expects
    // (CADENCEVOX_FRAME_48K * 2). The microphone delivers mono, so accumulate
    // half that many samples and duplicate each one into left and right.
    const stereoFrame = options.processorOptions.frameSize || 1920;
    this._mono = stereoFrame >> 1;
    this._buffer = new Float32Array(this._mono);
    this._position = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let inputPosition = 0;
    while (inputPosition < channel.length) {
      const take = Math.min(channel.length - inputPosition, this._mono - this._position);
      for (let offset = 0; offset < take; offset += 1) {
        const value = Math.max(-1, Math.min(1, channel[inputPosition + offset]));
        this._buffer[this._position + offset] = value;
      }
      this._position += take;
      inputPosition += take;
      if (this._position === this._mono) {
        const frame = new Int16Array(this._mono * 2);
        for (let sample = 0; sample < this._mono; sample += 1) {
          const value = this._buffer[sample] * 32767;
          frame[sample * 2] = value;
          frame[sample * 2 + 1] = value;
        }
        this.port.postMessage(frame, [frame.buffer]);
        this._position = 0;
      }
    }
    return true;
  }
}

registerProcessor('cadencevox-capture', CadenceVoxCapture);
