function modPow(base: bigint, exponent: bigint, modulus: bigint) {
  let result = 1n;
  let b = base % modulus;
  for (let e = exponent; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
  }
  return result;
}

/** PKCS#1 v1.5 padding needs random bytes that are never zero. */
function nonZeroRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    while (bytes[i] === 0)
      bytes[i] = crypto.getRandomValues(new Uint8Array(1))[0];
  }
  return bytes;
}

/**
 * Encrypts `text` the way Steam wants account passwords: RSA with PKCS#1 v1.5 padding,
 * key given as hex modulus and exponent, result in base64.
 * Needs `crypto.getRandomValues`, which React Native has to polyfill.
 */
export function rsaEncrypt(
  text: string,
  modulusHex: string,
  exponentHex: string,
) {
  const modulus = BigInt(`0x${modulusHex}`);
  const keyLength = Math.ceil(modulus.toString(16).length / 2);
  const message = new TextEncoder().encode(text);
  if (message.length > keyLength - 11) throw new Error('Text too long for RSA');

  // 0x00 0x02 <random non-zero padding> 0x00 <message>
  const padded = new Uint8Array(keyLength);
  padded[1] = 2;
  padded.set(nonZeroRandomBytes(keyLength - message.length - 3), 2);
  padded.set(message, keyLength - message.length);

  const hex = Array.from(padded, (b) => b.toString(16).padStart(2, '0'));
  const encrypted = modPow(
    BigInt(`0x${hex.join('')}`),
    BigInt(`0x${exponentHex}`),
    modulus,
  )
    .toString(16)
    .padStart(keyLength * 2, '0');
  let binary = '';
  for (let i = 0; i < encrypted.length; i += 2) {
    binary += String.fromCharCode(
      Number.parseInt(encrypted.slice(i, i + 2), 16),
    );
  }
  return btoa(binary);
}
