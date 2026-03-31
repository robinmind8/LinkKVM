import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface PermissionInfo {
  camera: string;
}

interface PermissionDialogProps {
  onAllGranted: () => void;
}

export default function PermissionDialog({ onAllGranted }: PermissionDialogProps) {
  const [permissions, setPermissions] = useState<PermissionInfo | null>(null);
  const [requesting, setRequesting] = useState(false);

  const checkPermissions = useCallback(async () => {
    try {
      const status = await invoke<PermissionInfo>('check_permissions');
      setPermissions(status);
      if (status.camera === 'authorized') {
        onAllGranted();
      }
    } catch (e) {
      console.error('Permission check failed:', e);
      // If check fails, don't block the user
      onAllGranted();
    }
  }, [onAllGranted]);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const handleRequestCamera = async () => {
    setRequesting(true);
    try {
      const granted = await invoke<boolean>('request_camera_permission');
      if (granted) {
        await checkPermissions();
      } else {
        // Re-check to update status
        await checkPermissions();
      }
    } catch (e) {
      console.error('Permission request failed:', e);
    } finally {
      setRequesting(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await invoke('open_privacy_settings');
    } catch (e) {
      console.error('Failed to open settings:', e);
    }
  };

  // Still loading
  if (!permissions) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-th-surface border border-th-border rounded-2xl p-8 text-center">
          <div className="w-6 h-6 border-2 border-th-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-th-text-sub mt-3">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // All granted
  if (permissions.camera === 'authorized') {
    return null;
  }

  const cameraStatus = permissions.camera;
  const isDenied = cameraStatus === 'denied' || cameraStatus === 'restricted';
  const isNotDetermined = cameraStatus === 'notDetermined';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-th-surface border border-th-border rounded-2xl shadow-2xl w-[480px] overflow-hidden transition-colors duration-300">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-th-warning/15 border border-th-warning/30 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-th-warning">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-th-text">Check App Permissions</h2>
          <p className="text-xs text-th-text-sub mt-1.5 leading-relaxed">
            LinkKVM requires your authorization for full functionality. Enabling these permissions is recommended but not required for normal use.
          </p>
        </div>

        {/* Permissions list */}
        <div className="px-6 pb-4 space-y-3">
          {/* Camera */}
          <div className="p-4 rounded-xl bg-th-base border border-th-border">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-th-accent">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span className="text-sm font-medium text-th-text">Camera / Capture Card</span>
                </div>
                <p className="text-xs text-th-text-sub leading-relaxed">
                  This permission is required to capture remote screen from camera or capture card.
                </p>
              </div>
              <div className="flex-shrink-0">
                {cameraStatus === 'authorized' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-th-success bg-th-success/10 px-2.5 py-1.5 rounded-lg">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Allowed
                  </span>
                ) : isDenied ? (
                  <button
                    className="text-xs bg-th-accent/15 text-th-accent border border-th-accent/30 px-3 py-1.5 rounded-lg hover:bg-th-accent/25 transition-colors"
                    onClick={handleOpenSettings}
                  >
                    Go to Settings
                  </button>
                ) : isNotDetermined ? (
                  <button
                    className="btn-primary text-xs !px-3 !py-1.5"
                    onClick={handleRequestCamera}
                    disabled={requesting}
                  >
                    {requesting ? 'Requesting...' : 'Allow Access'}
                  </button>
                ) : (
                  <span className="text-xs text-th-text-dim px-2.5 py-1.5">Unknown</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-between items-center">
          {isDenied && (
            <p className="text-[10px] text-th-text-dim flex-1 pr-4">
              After permission is denied, please enable it manually in System Settings → Privacy & Security → Camera.
            </p>
          )}
          {!isDenied && <div />}
          <button
            className="btn-ghost border border-th-border text-xs"
            onClick={onAllGranted}
          >
            {isDenied ? 'Later' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
}
