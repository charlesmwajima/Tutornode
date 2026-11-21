// Client-side App Lock utilities using Web Crypto SHA-256 salted PIN hashes and optional hardware WebAuthn.

function getPrefix(uKey: string) {
  return `tutornode_lock_${uKey}`;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(input));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new Error('Secure Web Crypto API is unavailable in this browser context.');
}

function generateSaltHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  window.crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isAppLockEnabled(uKey: string): boolean {
  return localStorage.getItem(`tutor_app_lock_enabled_${uKey}`) === 'true';
}

export function setAppLockEnabledStorage(uKey: string, enabled: boolean): void {
  localStorage.setItem(`tutor_app_lock_enabled_${uKey}`, enabled ? 'true' : 'false');
}

export function hasAppLockPin(uKey: string): boolean {
  return Boolean(
    localStorage.getItem(`${getPrefix(uKey)}_pin_hash`) ||
      localStorage.getItem(`tutor_app_lock_password_${uKey}`)
  );
}

export async function saveAppLockPin(uKey: string, pin: string): Promise<void> {
  const cleanPin = pin.trim();
  if (cleanPin.length < 4) {
    throw new Error('Security PIN must be at least 4 characters.');
  }
  const salt = generateSaltHex();
  const hash = await sha256Hex(`${salt}:${cleanPin}`);
  localStorage.setItem(`${getPrefix(uKey)}_pin_hash`, `${salt}:${hash}`);
  // Remove any legacy plaintext key
  localStorage.removeItem(`tutor_app_lock_password_${uKey}`);
}

export async function verifyAppLockPin(uKey: string, candidate: string): Promise<boolean> {
  const cleanCandidate = candidate.trim();
  const storedHash = localStorage.getItem(`${getPrefix(uKey)}_pin_hash`);

  if (storedHash && storedHash.includes(':')) {
    const [salt, expectedHex] = storedHash.split(':');
    const candidateHex = await sha256Hex(`${salt}:${cleanCandidate}`);
    return candidateHex === expectedHex;
  }

  // Migrate legacy plaintext PIN once if verified
  const legacyPlain = localStorage.getItem(`tutor_app_lock_password_${uKey}`);
  if (legacyPlain && cleanCandidate === legacyPlain) {
    await saveAppLockPin(uKey, cleanCandidate);
    return true;
  }

  return false;
}

export function clearAppLockData(uKey: string): void {
  localStorage.removeItem(`${getPrefix(uKey)}_pin_hash`);
  localStorage.removeItem(`tutor_app_lock_password_${uKey}`);
  localStorage.removeItem(`tutor_app_lock_enabled_${uKey}`);
  localStorage.removeItem(`tutor_app_lock_biometrics_enabled_${uKey}`);
  localStorage.removeItem(`tutor_app_lock_webauthn_credential_id_${uKey}`);
}

export function hasWebAuthnCredential(uKey: string): boolean {
  return Boolean(localStorage.getItem(`tutor_app_lock_webauthn_credential_id_${uKey}`));
}

export async function isPlatformBiometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollWebAuthnBiometric(uKey: string, userEmail: string): Promise<void> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('Passkeys / WebAuthn are not supported on this device or browser.');
  }
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const userIdBytes = new TextEncoder().encode(uKey.slice(0, 32));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'TutorNode',
        id: window.location.hostname || 'localhost',
      },
      user: {
        id: userIdBytes,
        name: userEmail || uKey,
        displayName: userEmail || 'TutorNode Learner',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Hardware credential enrollment was cancelled.');
  }

  const rawId = new Uint8Array(credential.rawId);
  const b64 = btoa(String.fromCharCode(...rawId));
  localStorage.setItem(`tutor_app_lock_webauthn_credential_id_${uKey}`, b64);
  localStorage.setItem(`tutor_app_lock_biometrics_enabled_${uKey}`, 'true');
}

export async function verifyWebAuthnBiometric(uKey: string): Promise<boolean> {
  const credentialIdB64 = localStorage.getItem(`tutor_app_lock_webauthn_credential_id_${uKey}`);
  if (!credentialIdB64) {
    throw new Error('No hardware passkey is enrolled on this browser.');
  }
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const rawCredentialId = Uint8Array.from(atob(credentialIdB64), (c) => c.charCodeAt(0));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname || 'localhost',
      allowCredentials: [{ id: rawCredentialId, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  });

  return Boolean(assertion);
}
