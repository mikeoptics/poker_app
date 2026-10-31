/// <reference types="vite/client" />

interface Window {
	cast?: any;
	chrome?: any;
	__onGCastApiAvailable?: (available: boolean) => void;
}
