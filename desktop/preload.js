// Preload minimal — le renderer utilise fetch() directement via api-bridge.js
// Ce fichier existe pour respecter la bonne pratique contextIsolation=true.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
});
