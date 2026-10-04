import { useColorScheme } from 'react-native';

export function useColors() {
  const dark = useColorScheme() === 'dark';
  return {
    text: dark ? '#f2f2f2' : '#111',
    muted: '#8a8a8a',
    background: dark ? '#000' : '#fff',
    border: dark ? '#333' : '#ccc',
    online: '#4cb050',
    error: '#e5534b',
  };
}
