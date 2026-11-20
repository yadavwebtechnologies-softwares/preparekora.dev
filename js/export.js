"use strict";

(() => {

    const $ = (id) => document.getElementById(id);
    let isExporting = false;

    function showOverlay() {
        const o = $("exportOverlay");
        const b = $("exportProgressBar");
        const t = $("exportProgressText");
        if (o) o.hidden = false;
        if (b) b.style.width = "10%";
        if (t) t.textContent = "Rendering high-resolution image...";
    }

    function setProgress(pct, msg) {
        const b = $("exportProgressBar");
        const t = $("exportProgressText");
        if (b) b.style.width = pct + "%";
        if (t && msg) t.textContent = msg;
    }

    function hideOverlay() {
        const o = $("exportOverlay");
        if (o) o.hidden = true;
    }

    function buildFilename(id, format, suffix) {
        let safe = (id || "image").replace(/[\/\\\s]+/g, "-");
        if (suffix) safe += "-" + suffix;
        return "preparekora-" + safe + "." + (format || "png");
    }

    function twoFrames() {
        return new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
    }

    async function renderPosterToDataURL() {
        const poster = $("poster");
        const resolution = parseInt($("exportResolution").value, 10) || 4;
        const format = $("exportFormat").value || "png";
        const quality = (parseInt($("exportQuality").value, 10) || 90) / 100;
        const scale = 2 * resolution;

        if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (_) {}
        }

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

            const link = document.createElement("a");
            link.href = dataURL;
            link.download = buildFilename(getIdState().current, format, "");
            document.body.appendChild(link);
            link.click();
            link.remove();

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


    /* Dual export — FIXED: render both first, then synchronous downloads */

    async function runExportBoth() {
        if (isExporting) return;
        if (!window.html2canvas) { alert("Export library not loaded. Please refresh."); return; }

        const editor = window.PreparekoraEditor;
        if (!editor || !editor.setExplanation) { alert("Editor not ready."); return; }

        const originalState = editor.isExplanationOn();
        const id = getIdState().current;

        isExporting = true;
        showOverlay();

        try {
            /* ---------- Step 1: render WITHOUT explanation ---------- */
            setProgress(10, "Rendering normal MCQ...");
            editor.setExplanation(false);
            await twoFrames();
            await new Promise(r => setTimeout(r, 150));
            const r1 = await renderPosterToDataURL();

            /* ---------- Step 2: render WITH explanation ---------- */
            setProgress(50, "Rendering MCQ with explanation...");
            editor.setExplanation(true);
            await twoFrames();
            await new Promise(r => setTimeout(r, 150));
            const r2 = await renderPosterToDataURL();

            /* ---------- Step 3: restore UI state ---------- */
            editor.setExplanation(originalState);
            await twoFrames();

            /* ---------- Safety: confirm images differ ---------- */
            if (r1.dataURL === r2.dataURL) {
                console.warn("Both renders produced identical dataURL — retrying with longer wait.");
                editor.setExplanation(false);
                await new Promise(r => setTimeout(r, 400));
                const retry = await renderPosterToDataURL();
                r1.dataURL = retry.dataURL;
                editor.setExplanation(originalState);
            }

            /* ---------- Step 4: BOTH downloads synchronously ---------- */
            setProgress(92, "Downloading both variants...");

            const link1 = document.createElement("a");
            link1.href = r1.dataURL;
            link1.download = buildFilename(id, r1.format, "Q");
            const link2 = document.createElement("a");
            link2.href = r2.dataURL;
            link2.download = buildFilename(id, r2.format, "E");

            document.body.appendChild(link1);
            document.body.appendChild(link2);

            // Synchronous clicks — preserves gesture context, allows 2 downloads
            link1.click();
            link2.click();

            // Defer cleanup
            setTimeout(() => { link1.remove(); link2.remove(); }, 1000);

            setProgress(100, "Both downloaded.");
            const est = $("exportStatus");
            if (est) est.textContent = "Both variants downloaded (Normal + Explanation).";

            if (editor.incrementId) {
                setTimeout(() => editor.incrementId(), 700);
            }
        } catch (err) {
            console.error("Both-export failed:", err);
            const est = $("exportStatus");
            if (est) est.textContent = "Export failed. Please try again.";
            alert("Export failed. Please try again.");
        } finally {
            editor.setExplanation(originalState);
            setTimeout(hideOverlay, 700);
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
