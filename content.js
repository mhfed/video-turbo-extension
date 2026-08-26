(() => {
  "use strict";

  const MIN_SPEED = 0.25;
  const MAX_SPEED = 16;
  const STEP = 0.25;
  const hostname = location.hostname || "local-file";

  let speed = 1;
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
    if (!video) return false;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    showHud(video.paused ? "Tạm dừng" : "Đang phát");
    return true;
  }

  function isTypingTarget(target) {
    return target instanceof Element && (
      target.matches("input, textarea, select") || target.isContentEditable
    );
  }

  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTypingTarget(event.target)) return;

    const actions = {
      ArrowRight: () => applySpeed(speed + STEP),
      ArrowLeft: () => applySpeed(speed - STEP),
      Digit0: () => applySpeed(1),
      KeyJ: () => seek(-10),
      KeyK: () => togglePlayback(),
      KeyL: () => seek(10)
    };

    const action = actions[event.code];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }, true);

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
      const video = getPrimaryVideo();
      sendResponse({ speed, videoCount: videos().length, paused: video?.paused ?? true, hostname });
    }

    if (message.type === "VIDEO_TURBO_SET_SPEED") {
      sendResponse({ speed: applySpeed(message.speed) });
    }

    if (message.type === "VIDEO_TURBO_SEEK") {
      sendResponse({ success: seek(Number(message.seconds) || 0) });
    }

    if (message.type === "VIDEO_TURBO_TOGGLE") {
      sendResponse({ success: togglePlayback() });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rememberSite) rememberSite = changes.rememberSite.newValue;
  });

  chrome.storage.local.get(["rememberSite", `speed:${hostname}`, "lastSpeed"], (stored) => {
    rememberSite = stored.rememberSite !== false;
    const initialSpeed = rememberSite ? stored[`speed:${hostname}`] : stored.lastSpeed;
    applySpeed(initialSpeed || 1, { persist: false, notify: false });
  });

  startObserver();
})();
