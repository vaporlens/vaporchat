import { registerRootComponent } from 'expo';
import { registerGlobals } from 'react-native-webrtc';
import App from './App';

// the vaporchat client uses the browser WebRTC globals (RTCPeerConnection, MediaStream, mediaDevices)
registerGlobals();
registerRootComponent(App);
