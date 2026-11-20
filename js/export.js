"use strict";

/* =========================================
   Preparekora MCQ Studio
   Export Controller
========================================= */

(() => {

    const $ = (id) => document.getElementById(id);
    let isExporting = false;

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

    function buildFilename(id, format, suffix) {
        let safe = (id || "image").replace(/[\/\\\s]+/g, "-");
        if (suffix) safe += "-" + suffix;
        return "preparekora-" + safe + "." + (format || "png");
    }

    function triggerDownload(dataURL, filename) {
        const link = document.createElement("a");
        link.href = dataURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async function renderPosterToDataURL() {
        const poster = $("poster");
        const resolution = parseInt($("exportResolution").value, 10) || 4;
        const format = $("exportFormat").value || "png";
        const quality = (parseInt($("exportQuality").value, 10) || 90) / 100;
        const scale = 2 * resolution;

        const canvas = await html2canvas(poster, {
            scale: scale,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
            windowWidth: poster.scrollWidth,
            windowHeight: poster.scrollHeight
        });

        const mime = format === "webp" ? "image/webp" : "image/png";
        return { dataURL: canvas.toDataURL(mime, quality), format };
    }

    function getIdState() {
        return (window.PreparekoraEditor && window.PreparekoraEditor.getIdState)
            ? window.PreparekoraEditor.getIdState()
            : { current: "image" };
    }


    /* Single export */

    async function runExport() {
        if (isExporting) return;
        if (!window.html2canvas) { alert("Export library not loaded. Please refresh."); return; }

        isExporting = true;
        showOverlay();
        setProgress(20, "Preparing canvas...");

        try {
            const { dataURL, format } = await renderPosterToDataURL();
            setProgress(85, "Encoding image...");

            triggerDownload(dataURL, buildFilename(getIdState().current, format, ""));
            setProgress(100, "Done.");

            const est = $("exportStatus");
            if (est) est.textContent = "Image downloaded successfully.";

            if (window.PreparekoraEditor && window.PreparekoraEditor.incrementId) {
                setTimeout(() => window.PreparekoraEditor.incrementId(), 400);
            }
        } catch (err) {
            console.error("Export failed:", err);
            const est = $("exportStatus");
            if (est) est.textContent = "Export failed. Please try again.";
            alert("Export failed. Please try again.");
        } finally {
            setTimeout(hideOverlay, 500);
            isExporting = false;
        }
    }


    /* Dual export (MCQ only) */

    async function runExportBoth() {
        if (isExporting) return;
        if (!window.html2canvas) { alert("Export library not loaded. Please refresh."); return; }

        const editor = window.PreparekoraEditor;
        if (!editor || !editor.setExplanation) { alert("Editor not ready."); return; }

        const originalState = editor.isExplanationOn();
        isExporting = true;

        showOverlay();

        try {
            // 1) Normal MCQ (no explanation)
            setProgress(10, "Rendering normal MCQ...");
            editor.setExplanation(false);
            await new Promise(r => setTimeout(r, 180));
            const r1 = await renderPosterToDataURL();

            // 2) MCQ with explanation
            setProgress(50, "Rendering MCQ with explanation...");
            editor.setExplanation(true);
            await new Promise(r => setTimeout(r, 180));
            const r2 = await renderPosterToDataURL();

            setProgress(85, "Downloading both variants...");

            const id = getIdState().current;
            triggerDownload(r1.dataURL, buildFilename(id, r1.format, "Q"));
            await new Promise(r => setTimeout(r, 200));
            triggerDownload(r2.dataURL, buildFilename(id, r2.format, "E"));

            setProgress(100, "Both downloaded.");

            const est = $("exportStatus");
            if (est) est.textContent = "Both variants downloaded (Normal + Explanation).";

            if (editor.incrementId) {
                setTimeout(() => editor.incrementId(), 500);
            }
        } catch (err) {
            console.error("Both-export failed:", err);
            const est = $("exportStatus");
            if (est) est.textContent = "Export failed. Please try again.";
            alert("Export failed. Please try again.");
        } finally {
            editor.setExplanation(originalState);
            setTimeout(hideOverlay, 600);
            isExporting = false;
        }
    }


    function init() {
        const btn = $("exportButton");
        if (btn) btn.addEventListener("click", runExport);

        const bothBtn = $("exportBothButton");
        if (bothBtn) bothBtn.addEventListener("click", runExportBoth);

        console.log("Preparekora exporter ready.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

})();
