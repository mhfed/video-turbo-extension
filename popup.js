(() => {
  "use strict";

  const slider = document.getElementById("speed-slider");
  const output = document.getElementById("speed-output");
  const siteLabel = document.getElementById("site-label");
  const statusDot = document.getElementById("status-dot");
  const playButton = document.getElementById("play-button");
  const muteButton = document.getElementById("mute-button");
  const loopButton = document.getElementById("loop-button");
  const rememberToggle = document.getElementById("remember-site");
  const timeLabel = document.getElementById("time-label");
  const progress = document.getElementById("media-progress");
  const videoCount = document.getElementById("video-count");
  const presetButtons = [...document.querySelectorAll("[data-speed]")];
  const stepButtons = [...document.querySelectorAll("[data-step]")];
  const seekButtons = [...document.querySelectorAll("[data-seek]")];

  let activeTabId;
  let currentSpeed = 1;
  let currentHostname = "";
  let settings = {
    keyboardStep: 0.1,
    seekStep: 10,
    rememberSite: true
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const formatSpeed = (value) => `${Number(Number(value).toFixed(2))}×`;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function renderSpeed(value) {
    currentSpeed = Number(value);
    slider.value = currentSpeed;
    output.value = formatSpeed(currentSpeed);
    const ratio = (currentSpeed - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
    slider.style.setProperty("--progress", `${clamp(ratio * 100, 0, 100)}%`);
    presetButtons.forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.speed) === currentSpeed);
    });
  }

  function renderMedia(state) {
    if (!state) return;
    renderSpeed(state.speed);
    playButton.classList.toggle("playing", !state.paused);
    muteButton.classList.toggle("active", Boolean(state.muted));
    muteButton.setAttribute("aria-pressed", String(Boolean(state.muted)));
    loopButton.classList.toggle("active", Boolean(state.loop));
    loopButton.setAttribute("aria-pressed", String(Boolean(state.loop)));

    const count = Number(state.videoCount) || 0;
    videoCount.textContent = `${count} video`;
    statusDot.classList.toggle("online", count > 0);
    statusDot.title = count > 0 ? "Đã kết nối video" : "Chưa tìm thấy video";
    timeLabel.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
    const played = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    progress.style.width = `${clamp(played, 0, 100)}%`;

    if (state.hostname) {
      currentHostname = state.hostname;
      siteLabel.textContent = count
        ? `${currentHostname} · đang điều khiển`
        : `${currentHostname} · chưa tìm thấy video`;
    }
  }

  function renderSettings() {
    rememberToggle.checked = settings.rememberSite;
    stepButtons.forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.step) === settings.keyboardStep);
    });
    seekButtons.forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.seek) === settings.seekStep);
    });
    document.getElementById("back-label").textContent = settings.seekStep;
    document.getElementById("forward-label").textContent = settings.seekStep;
  }

  async function send(message, { silent = false } = {}) {
    if (!activeTabId) return null;
    try {
      return await chrome.tabs.sendMessage(activeTabId, message);
    } catch {
      if (!silent) {
        document.body.classList.add("unavailable");
        siteLabel.textContent = "Trang này không cho phép điều khiển video";
      }
      return null;
    }
  }

  async function setSpeed(value) {
    const response = await send({ type: "VIDEO_TURBO_SET_SPEED", speed: Number(value) });
    if (response) renderSpeed(response.speed);
  }

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      document.querySelectorAll("[data-tab]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll(".panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `${tab}-panel`);
      });
    });
  });

  slider.addEventListener("input", () => {
    renderSpeed(slider.value);
    setSpeed(slider.value);
  });

  presetButtons.forEach((button) => button.addEventListener("click", () => setSpeed(button.dataset.speed)));
  document.getElementById("decrease-button").addEventListener("click", () => setSpeed(currentSpeed - settings.keyboardStep));
  document.getElementById("increase-button").addEventListener("click", () => setSpeed(currentSpeed + settings.keyboardStep));
  document.getElementById("reset-button").addEventListener("click", () => setSpeed(1));

  document.getElementById("back-button").addEventListener("click", () => {
    send({ type: "VIDEO_TURBO_SEEK", seconds: -settings.seekStep });
  });
  document.getElementById("forward-button").addEventListener("click", () => {
    send({ type: "VIDEO_TURBO_SEEK", seconds: settings.seekStep });
  });
  document.getElementById("restart-button").addEventListener("click", async () => {
    const response = await send({ type: "VIDEO_TURBO_RESTART" });
    if (response) renderMedia(response);
  });
  playButton.addEventListener("click", async () => {
    const response = await send({ type: "VIDEO_TURBO_TOGGLE" });
    if (response) renderMedia(response);
  });
  muteButton.addEventListener("click", async () => {
    const response = await send({ type: "VIDEO_TURBO_TOGGLE_MUTE" });
    if (response?.success) {
      muteButton.classList.toggle("active", response.muted);
      muteButton.setAttribute("aria-pressed", String(response.muted));
    }
  });
  loopButton.addEventListener("click", async () => {
    const response = await send({ type: "VIDEO_TURBO_TOGGLE_LOOP" });
    if (response?.success) {
      loopButton.classList.toggle("active", response.loop);
      loopButton.setAttribute("aria-pressed", String(response.loop));
    }
  });

  stepButtons.forEach((button) => button.addEventListener("click", async () => {
    settings.keyboardStep = Number(button.dataset.step);
    await chrome.storage.local.set({ keyboardStep: settings.keyboardStep });
    renderSettings();
  }));

  seekButtons.forEach((button) => button.addEventListener("click", async () => {
    settings.seekStep = Number(button.dataset.seek);
    await chrome.storage.local.set({ seekStep: settings.seekStep });
    renderSettings();
  }));

  rememberToggle.addEventListener("change", async () => {
    settings.rememberSite = rememberToggle.checked;
    await chrome.storage.local.set({ rememberSite: settings.rememberSite });
  });

  async function initialize() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id;
    siteLabel.title = tab?.url || "";

    const stored = await chrome.storage.local.get(["rememberSite", "keyboardStep", "seekStep"]);
    settings = {
      rememberSite: stored.rememberSite !== false,
      keyboardStep: Number(stored.keyboardStep) || 0.1,
      seekStep: Number(stored.seekStep) || 10
    };
    renderSettings();

    const response = await send({ type: "VIDEO_TURBO_GET_STATE" });
    if (response) renderMedia(response);

    setInterval(async () => {
      const state = await send({ type: "VIDEO_TURBO_GET_STATE" }, { silent: true });
      if (state) renderMedia(state);
    }, 1000);
  }

  initialize();
})();
