export type AvatarGender = 'girl' | 'boy';
export type QualityTier = 'low' | 'medium' | 'high';

export interface DevicePerformanceProfile {
  tier: QualityTier;
  isSoftwareGl: boolean;
  isMobile: boolean;
  gpuName: string;
}

const DB_NAME = 'airi-vrm-cache-v3';
const STORE_NAME = 'models';

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedVrmBuffer(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openCacheDb();
    return await new Promise<ArrayBuffer | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        resolve(getReq.result instanceof ArrayBuffer ? getReq.result : null);
      };
      getReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedVrmBuffer(key: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(buffer, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore storage quota errors on restricted devices
  }
}

export async function fetchVrmWithCache(
  url: string,
  onProgress?: (percent: number, fromCache: boolean) => void
): Promise<ArrayBuffer> {
  const cached = await getCachedVrmBuffer(url);
  if (cached && cached.byteLength > 100000) {
    onProgress?.(100, true);
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch VRM (${response.status})`);
  }

  const contentLength = Number(response.headers.get('content-length') || 15000000);
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.(100, false);
    await setCachedVrmBuffer(url, buffer);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedLength += value.length;
      const pct = Math.min(99, Math.round((receivedLength / contentLength) * 100));
      onProgress?.(pct, false);
    }
  }

  const combined = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    combined.set(chunk, position);
    position += chunk.length;
  }

  const arrayBuffer = combined.buffer;
  onProgress?.(100, false);
  void setCachedVrmBuffer(url, arrayBuffer);
  return arrayBuffer;
}

export function detectDevicePerformance(): DevicePerformanceProfile {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      tier: 'medium',
      isSoftwareGl: false,
      isMobile: false,
      gpuName: 'Server',
    };
  }

  let gpuName = 'WebGL GPU';
  let isSoftwareGl = false;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      isSoftwareGl = true;
    } else {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      gpuName = String(gl.getParameter(param) || 'WebGL GPU');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuName);
    }
  } catch {
    isSoftwareGl = true;
  }

  const isMobile =
    window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const isEntryMobileGpu = /Mali-4|Mali-T|Mali-G3|Mali-G5[12]|Adreno \(TM\) [345]|PowerVR/i.test(
    gpuName
  );

  let tier: QualityTier = 'medium';
  if (isSoftwareGl || isEntryMobileGpu) {
    tier = 'low';
  } else if (!isMobile) {
    tier = 'high';
  }

  return {
    tier,
    isSoftwareGl,
    isMobile,
    gpuName,
  };
}
