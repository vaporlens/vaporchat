import { registerRootComponent } from 'expo';
import { getRandomValues } from 'expo-crypto';
import { registerGlobals } from 'react-native-webrtc';
import App from './App';

// the vaporchat client uses the browser WebRTC globals (RTCPeerConnection, MediaStream, mediaDevices)
registerGlobals();
// Hermes has no Web Crypto, Steam's password encryption needs random bytes
globalThis.crypto ??= { getRandomValues } as Crypto;
registerRootComponent(App);
