declare const __NEXTJOB_BUILD_ID__: string;

// Vite supplies one identifier to both the server and client bundles.
export const BUILD_VERSION = typeof __NEXTJOB_BUILD_ID__ === "string" ? __NEXTJOB_BUILD_ID__ : "dev";
