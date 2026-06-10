"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEncryptionKey = getEncryptionKey;
exports.generateAndSaveKey = generateAndSaveKey;
exports.encrypt = encrypt;
exports.decrypt = decrypt;
// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
let KEY_FILE = '';
try {
    KEY_FILE = path.join(os.homedir() || os.tmpdir() || '.', '.antigravity-devops-key');
}
catch (e) {
    KEY_FILE = path.join('.', '.antigravity-devops-key');
}
function getEncryptionKey() {
    try {
        if (fs.existsSync(KEY_FILE)) {
            return fs.readFileSync(KEY_FILE, 'utf8').trim();
        }
    }
    catch (error) {
        // Ignore read errors, treat as missing key
    }
    return null;
}
function generateAndSaveKey() {
    const key = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
    return key;
}
function encrypt(text, keyHex) {
    const iv = crypto.randomBytes(12);
    const key = Buffer.from(keyHex, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}
function decrypt(cipherText, keyHex) {
    const [ivHex, authTagHex, encrypted] = cipherText.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
        throw new Error('Invalid cipher text format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = Buffer.from(keyHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
