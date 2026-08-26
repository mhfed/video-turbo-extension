(() => {
  "use strict";

  const MIN_SPEED = 0.25;
  const MAX_SPEED = 16;
  const hostname = location.hostname || "local-file";

  let speed = 1;
  let keyboardStep = 0.1;
  let rememberSite = true;
  let hudTimer;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const roundSpeed = (value) => Math.round(value * 100) / 100;
  const videos = () => [...document.querySelectorAll("video")];

  function formatSpeed(value) {
    return `${Number(value.toFixed(2))}×`;
  }

  function getPrimaryVideo() {
    const candidates = videos();
    if (!candidates.length) return null;

    return candidates
      .map((video) => {
        const rect = video.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
        const visibleHeight = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
        return { video, area: visibleWidth * visibleHeight };
      })
      .sort((a, b) => b.area - a.area)[0].video;
  }

  function showHud(text) {
    if (!document.documentElement) return;
    let hud = document.getElementById("video-turbo-hud");

    if (!hud) {
      hud = document.createElement("div");
      hud.id = "video-turbo-hud";
      Object.assign(hud.style, {
        position: "fixed",
        top: "20px",
        left: "50%",
        zIndex: "2147483647",
        padding: "10px 16px",
        border: "1px solid rgba(255,255,255,.16)",
        borderRadius: "12px",
        background: "rgba(15,17,21,.9)",
        boxShadow: "0 12px 40px rgba(0,0,0,.35)",
        color: "#fff",
        font: "600 14px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        letterSpacing: ".01em",
        pointerEvents: "none",
        opacity: "0",
        transform: "translate(-50%, -8px)",
        transition: "opacity .15s ease, transform .15s ease",
        backdropFilter: "blur(10px)"
      });
      document.documentElement.appendChild(hud);
    }

    hud.textContent = text;
    requestAnimationFrame(() => {
      hud.style.opacity = "1";
      hud.style.transform = "translate(-50%, 0)";
    });

    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
      hud.style.opacity = "0";
      hud.style.transform = "translate(-50%, -8px)";
    }, 900);
  }

  function applySpeed(nextSpeed, { persist = true, notify = true } = {}) {
    speed = roundSpeed(clamp(Number(nextSpeed) || 1, MIN_SPEED, MAX_SPEED));
    videos().forEach((video) => {
      if (video.playbackRate !== speed) video.playbackRate = speed;
    });

    if (persist) {
      const update = { lastSpeed: speed };
      if (rememberSite) update[`speed:${hostname}`] = speed;
      chrome.storage.local.set(update);
    }

    if (notify) showHud(formatSpeed(speed));
    return speed;
  }

  function seek(seconds) {
    const video = getPrimaryVideo();
    if (!video) return false;
    const maxTime = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = clamp(video.currentTime + seconds, 0, maxTime);
    showHud(`${seconds > 0 ? "+" : ""}${seconds}s`);
    return true;
  }

  function togglePlayback() {
    const video = getPrimaryVideo();
    if (!video) return null;
    const willPlay = video.paused;
    if (willPlay) video.play().catch(() => {});
    else video.pause();
    showHud(willPlay ? "Đang phát" : "Tạm dừng");
    return { paused: !willPlay };
  }

  function restartVideo() {
    const video = getPrimaryVideo();
    if (!video) return false;
    video.currentTime = 0;
    showHud("Phát lại từ đầu");
    return true;
  }

  function toggleMute() {
    const video = getPrimaryVideo();
    if (!video) return null;
    video.muted = !video.muted;
    showHud(video.muted ? "Đã tắt tiếng" : "Đã bật tiếng");
    return video.muted;
  }

  function toggleLoop() {
    const video = getPrimaryVideo();
    if (!video) return null;
    video.loop = !video.loop;
    showHud(video.loop ? "Đã bật lặp lại" : "Đã tắt lặp lại");
    return video.loop;
  }

  function getState() {
    const video = getPrimaryVideo();
    return {
      speed,
      videoCount: videos().length,
      paused: video?.paused ?? true,
      muted: video?.muted ?? false,
      loop: video?.loop ?? false,
      currentTime: Number.isFinite(video?.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video?.duration) ? video.duration : 0,
      hostname
    };
  }

  function isTypingTarget(target) {
    return target instanceof Element && (
      target.matches("input, textarea, select") || target.isContentEditable
    );
  }

  function getSpeedShortcutDirection(event) {
    if (
      event.code === "Equal" ||
      event.code === "NumpadAdd" ||
      event.key === "=" ||
      event.key === "+"
    ) return 1;

    if (
      event.code === "Minus" ||
      event.code === "NumpadSubtract" ||
      event.key === "-"
    ) return -1;

    return 0;
  }

  function handleSpeedShortcut(event) {
    if (event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;

    const direction = getSpeedShortcutDirection(event);
    if (!direction) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.type === "keydown") {
      applySpeed(speed + direction * keyboardStep);
    }
  }

  window.addEventListener("keydown", handleSpeedShortcut, true);
  window.addEventListener("keypress", handleSpeedShortcut, true);
  window.addEventListener("keyup", handleSpeedShortcut, true);

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => [...mutation.addedNodes].some((node) =>
      node.nodeType === Node.ELEMENT_NODE && (node.matches?.("video") || node.querySelector?.("video"))
    ))) {
      applySpeed(speed, { persist: false, notify: false });
    }
  });

  function startObserver() {
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } else {
      requestAnimationFrame(startObserver);
    }
  }

  document.addEventListener("loadedmetadata", (event) => {
    if (event.target instanceof HTMLVideoElement) event.target.playbackRate = speed;
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type?.startsWith("VIDEO_TURBO_")) return;

    if (message.type === "VIDEO_TURBO_GET_STATE") {
      sendResponse(getState());
    }

    if (message.type === "VIDEO_TURBO_SET_SPEED") {
      sendResponse({ speed: applySpeed(message.speed) });
    }

    if (message.type === "VIDEO_TURBO_SEEK") {
      sendResponse({ success: seek(Number(message.seconds) || 0) });
    }

    if (message.type === "VIDEO_TURBO_TOGGLE") {
      const result = togglePlayback();
      sendResponse({ success: result !== null, ...getState(), ...(result || {}) });
    }

    if (message.type === "VIDEO_TURBO_RESTART") {
      const success = restartVideo();
      sendResponse({ success, ...getState() });
    }

    if (message.type === "VIDEO_TURBO_TOGGLE_MUTE") {
      const muted = toggleMute();
      sendResponse({ success: muted !== null, muted });
    }

    if (message.type === "VIDEO_TURBO_TOGGLE_LOOP") {
      const loop = toggleLoop();
      sendResponse({ success: loop !== null, loop });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.rememberSite) rememberSite = changes.rememberSite.newValue;
    if (changes.keyboardStep) keyboardStep = Number(changes.keyboardStep.newValue) || 0.1;
  });

  chrome.storage.local.get(["rememberSite", "keyboardStep", `speed:${hostname}`, "lastSpeed"], (stored) => {
    rememberSite = stored.rememberSite !== false;
    keyboardStep = Number(stored.keyboardStep) || 0.1;
    const initialSpeed = rememberSite ? stored[`speed:${hostname}`] : stored.lastSpeed;
    applySpeed(initialSpeed || 1, { persist: false, notify: false });
  });

  startObserver();
})();
