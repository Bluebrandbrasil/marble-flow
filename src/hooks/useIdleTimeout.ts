import { useEffect, useCallback, useRef } from 'react';

type IdleTimeoutOptions = {
    onIdle: () => void;
    idleTime?: number; // Time in milliseconds. Default 30 minutes.
    isActive: boolean; // Control whether the hook should listen or not
};

const DEFAULT_IDLE_TIME = 30 * 60 * 1000; // 30 minutes

export function useIdleTimeout({ onIdle, idleTime = DEFAULT_IDLE_TIME, isActive }: IdleTimeoutOptions) {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const resetTimer = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        if (isActive) {
            timeoutRef.current = setTimeout(() => {
                onIdle();
            }, idleTime);
        }
    }, [idleTime, isActive, onIdle]);

    useEffect(() => {
        if (!isActive) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            return;
        }

        const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];

        // Initiate the timer right away
        resetTimer();

        // Attach event listeners
        events.forEach((eventName) => {
            document.addEventListener(eventName, resetTimer, { passive: true });
        });

        // Cleanup
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            events.forEach((eventName) => {
                document.removeEventListener(eventName, resetTimer);
            });
        };
    }, [resetTimer, isActive]);
}
