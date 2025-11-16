import { useEffect, useState } from "react";
import { WebContainer } from '@webcontainer/api';

let bootPromise: Promise<WebContainer> | null = null;

export function useWebContainer() {
    const [webcontainer, setWebcontainer] = useState<WebContainer>();

    useEffect(() => {
        if (!bootPromise) {
            bootPromise = WebContainer.boot().catch((error) => {
                bootPromise = null;
                throw error;
            });
        }

        let cancelled = false;

        bootPromise.then((instance) => {
            if (!cancelled) {
                setWebcontainer(instance);
            }
        }).catch((error) => {
            if (!cancelled) {
                console.error("Failed to boot WebContainer", error);
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    return webcontainer;
}