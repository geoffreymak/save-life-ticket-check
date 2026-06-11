import { registerSW } from "virtual:pwa-register";

export function registerPwaServiceWorker() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(
        () => {
          registration.update().catch(() => {});
        },
        60 * 60 * 1000,
      );
    },
    onRegisterError(error) {
      console.error("Service worker registration failed", error);
    },
  });
}
