/** Browser name/version the way Steam's client reports them in InitiateWebRTCConnection. */
export function browserInfo() {
  const ua = navigator.userAgent;
  const patterns: [string, RegExp][] = [
    ['Firefox', /Firefox\/([\d.]+)/],
    ['Chrome', /Chrom(?:e|ium)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, pattern] of patterns) {
    const match = ua.match(pattern);
    if (match) return { name, version: match[1] };
  }
  return { name: 'Chrome', version: '' };
}

export function waitForIceConnected(pc: RTCPeerConnection) {
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        pc.removeEventListener('iceconnectionstatechange', check);
        resolve();
      } else if (state === 'failed' || state === 'closed') {
        pc.removeEventListener('iceconnectionstatechange', check);
        reject(new Error(`ICE ${state}`));
      }
    };
    pc.addEventListener('iceconnectionstatechange', check);
    check();
  });
}
