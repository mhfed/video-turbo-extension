(() => {
  "use strict";

  const slider = document.getElementById("speed-slider");
  const output = document.getElementById("speed-output");
  const siteLabel = document.getElementById("site-label");
  const playButton = document.getElementById("play-button");
  const rememberToggle = document.getElementById("remember-site");
  const presetButtons = [...document.querySelectorAll("[data-speed]")];

  let activeTabId;

  const formatSpeed = (value) => `${Number(Number(value).toFixed(2))}×`;

  function renderSpeed(value) {
    const speed = Number(value);
    slider.value = speed;
    output.value = formatSpeed(speed);
    const progress = ((speed - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
    slider.style.setProperty("--progress", `${progress}%`);
    presetButtons.forEach((button) => button.classList.toggle("active", Number(button.dataset.speed) === speed));
  }

  async function send(message) {
    if (!activeTabId) return null;
    try {
      return await chrome.tabs.sendMessage(activeTabId, message);
    } catch {
      document.body.classList.add("unavailable");
      siteLabel.textContent = "Trang này không cho phép điều khiển video";
      return null;
    }
  }

  async function setSpeed(value) {
    const response = await send({ type: "VIDEO_TURBO_SET_SPEED", speed: Number(value) });
    if (response) renderSpeed(response.speed);
  }

  slider.addEventListener("input", () => {
    renderSpeed(slider.value);
    setSpeed(slider.value);
  });

  presetButtons.forEach((button) => button.addEventListener("click", () => setSpeed(button.dataset.speed)));
  document.getElementById("back-button").addEventListener("click", () => send({ type: "VIDEO_TURBO_SEEK", seconds: -10 }));
  document.getElementById("forward-button").addEventListener("click", () => send({ type: "VIDEO_TURBO_SEEK", seconds: 10 }));
  playButton.addEventListener("click", async () => {
    const response = await send({ type: "VIDEO_TURBO_TOGGLE" });
    if (response?.success) playButton.textContent = playButton.textContent === "▶" ? "Ⅱ" : "▶";
  });

  rememberToggle.addEventListener("change", () => chrome.storage.local.set({ rememberSite: rememberToggle.checked }));

  async function initialize() {
    const [{ id, url }] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = id;

    const stored = await chrome.storage.local.get("rememberSite");
    rememberToggle.checked = stored.rememberSite !== false;

    const response = await send({ type: "VIDEO_TURBO_GET_STATE" });
    if (!response) return;

    renderSpeed(response.speed);
    playButton.textContent = response.paused ? "▶" : "Ⅱ";
    siteLabel.textContent = response.videoCount
      ? `${response.hostname} · ${response.videoCount} video`
      : `${response.hostname} · chưa tìm thấy video`;
    siteLabel.title = url || response.hostname;
  }

  initialize();
})();
