import axios from "axios";

const b64ToBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));

  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** "unsupported" | "denied" | "on" | "off" */
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = reg ? await reg.pushManager.getSubscription() : null;

  return sub ? "on" : "off";
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser doesn't support push notifications.");

  const { data } = await axios.get("/api/push/key");
  const publicKey = data?.data?.publicKey;

  if (!publicKey) throw new Error("Push isn't configured on this server yet (VAPID keys missing).");

  const permission = await Notification.requestPermission();

  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings.");

  const reg = await navigator.serviceWorker.register("/sw.js");

  await navigator.serviceWorker.ready;

  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));

  await axios.post("/api/push/subscribe", sub.toJSON());
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = reg ? await reg.pushManager.getSubscription() : null;

  if (sub) {
    await axios.delete("/api/push/subscribe", { data: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
}
