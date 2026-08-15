import { safeArray } from '../lib/dataDiagnostics';
import { useState, useEffect, useCallback } from 'react';

interface AppVersionData {
    version: string;
    buildId: string;
    commit: string;
}

export const useAppVersion = () => {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [newVersionData, setNewVersionData] = useState<AppVersionData | null>(null);
    const [currentVersionData, setCurrentVersionData] = useState<AppVersionData | null>(() => {
        const saved = localStorage.getItem('app_version_data');
        return saved ? JSON.parse(saved) : null;
    });

    const checkVersion = useCallback(async () => {
        try {
            const res = await fetch('/version.json?t=' + new Date().getTime(), {
                cache: 'no-store'
            });

            if (!res.ok) return;

            const data: AppVersionData = await res.json();
            if (!data.version) return;

            const saved = localStorage.getItem('app_version_data');
            const savedData: AppVersionData | null = saved ? JSON.parse(saved) : null;

            if (savedData && savedData.version !== data.version) {
                setUpdateAvailable(true);
                setNewVersionData(data);
            } else if (!savedData) {
                // Initial set
                localStorage.setItem('app_version_data', JSON.stringify(data));
                setCurrentVersionData(data);
            }
        } catch (e) {
            console.warn("Failed to check for app updates:", e);
        }
    }, []);

    useEffect(() => {
        checkVersion();
        const interval = setInterval(checkVersion, 60000);
        return () => clearInterval(interval);
    }, [checkVersion]);

    const performUpdate = async () => {
        if (newVersionData) {
            localStorage.setItem('app_version_data', JSON.stringify(newVersionData));
        }

        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(safeArray(cacheNames).map(name => caches.delete(name)));
            } catch (e) {
                console.warn("Failed to clear caches:", e);
            }
        }

        if ('serviceWorker' in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
            } catch (e) {
                console.warn("Failed to unregister service workers:", e);
            }
        }

        window.location.href = window.location.origin + window.location.pathname + "?v=" + Date.now();
    };

    return {
        updateAvailable,
        currentVersion: currentVersionData?.version,
        currentBuildId: currentVersionData?.buildId,
        newVersion: newVersionData?.version,
        newBuildId: newVersionData?.buildId,
        performUpdate
    };
};
