import crypto from 'crypto';

// Use a 32 byte (256-bit) encryption key from the environment
const ENCRYPTION_KEY = process.env.META_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

export interface EncryptedData {
    iv: string; // Hex string
    encryptedToken: string; // Hex string
    authTag: string; // Hex string
}

/**
 * Encrypts a Meta access token using AES-256-GCM.
 */
export function encryptToken(token: string): EncryptedData {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        throw new Error('META_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
    }

    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(12); // GCM standard IV length is 12 bytes

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encryptedToken = cipher.update(token, 'utf8', 'hex');
    encryptedToken += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        iv: iv.toString('hex'),
        encryptedToken,
        authTag
    };
}

/**
 * Decrypts an encrypted Meta access token.
 */
export function decryptToken(encryptedData: EncryptedData): string {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        throw new Error('META_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
    }

    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encryptedToken, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}
