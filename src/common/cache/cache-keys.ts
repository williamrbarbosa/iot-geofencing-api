/**
 * Central registry of all Redis cache keys.
 *
 * Keeping keys here avoids magic strings scattered across services
 * and makes it easy to see everything that's cached at a glance.
 */
export const CacheKeys = {
  /**
   * All active geofences list.
   * Invalidated on geofence create, update, delete.
   */
  ACTIVE_GEOFENCES: "geofences:active",

  /**
   * Last known location + current geofence IDs for a device.
   * Key: "device:{id}:state"
   * Invalidated on every new location ingest.
   */
  deviceState: (deviceId: string) => `device:${deviceId}:state`,
} as const;

/**
 * TTLs in seconds.
 */
export const CacheTTL = {
  /** Geofences rarely change — 5 minutes is safe */
  ACTIVE_GEOFENCES: 300,

  /** Device state should be near real-time — 1 hour max */
  DEVICE_STATE: 3600,
} as const;
