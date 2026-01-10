import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root'
})
export class EncryptionService {
  private readonly SECRET_KEY = 'UXDRIVEN_SUPER_SECRET_KEY_v2_2026_#@!';

  decryptPayload(encryptedText: string): any {
    try {
      if (!encryptedText) return null;
      
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.SECRET_KEY);
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

      if (!decryptedString) {
        throw new Error('Falló la desencriptación: Resultado vacío.');
      }

      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('⛔ Security Error: No se pudo desencriptar el payload.', error);
      return null;
    }
  }
}