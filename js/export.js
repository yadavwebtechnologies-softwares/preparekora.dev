"use strict";

/* =========================================
   Preparekora MCQ Studio
   Export Controller
========================================= */

(() => {

    const $ = (id) => document.getElementById(id);

    function showOverlay() {
        const overlay = $("exportOverlay");
        const bar = $("exportProgressBar");
        const text = $("exportProgressText");
        if (overlay) overlay.hidden = false;
        if (bar) bar.style.width = "10%";
        if (text) text.textContent = "Rendering high-resolution image...";
    }

    function setProgress(pct, msg) {
        const bar = $("exportProgressBar");
        const text = $("exportProgressText");
        if (bar) bar.style.width = pct + "%";
        if (text && msg) text.textContent = msg;
    }

    function hideOverlay() {
        const overlay = $("exportOverlay");
        if (overlay) overlay.hidden = true;
    }

    function buildFilename(id, format) {
        const safe = (id || "image").replace(/[\/\\\s]+/g, "-");
        return "preparekora-" + safe + "." + (format || "png");
    }

    async function runExport() {
        const poster = $("poster");
        if (!poster) return;

        if (!window.html2canvas) {
            alert("Export library not loaded. Please refresh.");
            return;
        }

        const resolution = parseInt($("exportResolution").value, 10) || 4;
        const format = $("exportFormat").value || "png";
        const quality = (parseInt($("exportQuality").value, 10) || 90) / 100;

        // html2canvas scale: display(poster) -> canvas -> output
        // posterWidth = canvasWidth / 2  =>  scale = 2 * resolution
        const scale = 2 * resolution;

        showOverlay();
        setProgress(20, "Preparing canvas...");

        try {
            const canvas = await html2canvas(poster, {
                scale: scale,
                backgroundColor: "#ffffff",
                useCORS: true,
                logging: false,
                windowWidth: poster.scrollWidth,
                windowHeight: poster.scrollHeight
            });

            setProgress(75, "Encoding image...");

            const mime = format === "webp" ? "image/webp" : "image/png";
            const dataURL = canvas.toDataURL(mime, quality);

            setProgress(95, "Download starting...");

            const idState = (window.PreparekoraEditor && window.PreparekoraEditor.getIdState)
                ? window.PreparekoraEditor.getIdState()
                : { current: "image" };

            const link = document.createElement("a");
            link.href = dataURL;
            link.download = buildFilename(idState.current, format);
            document.body.appendChild(link);
            link.click();
            link.remove();

            setProgress(100, "Done.");

            const est = $("exportStatus");
            if (est) est.textContent = "Image downloaded successfully.";

            // Auto-increment ID after successful export
            if (window.PreparekoraEditor && typeof window.PreparekoraEditor.incrementId === "function") {
                setTimeout(() => window.PreparekoraEditor.incrementId(), 400);
            }

        } catch (err) {
            console.error("Export failed:", err);
            const est = $("exportStatus");
            if (est) est.textContent = "Export failed. Please try again.";
            alert("Export failed. Please try again.");
        } finally {
            setTimeout(hideOverlay, 500);
        }
    }

    function init() {
        const btn = $("exportButton");
        if (btn) btn.addEventListener("click", runExport);
        console.log("Preparekora exporter ready.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

})();
