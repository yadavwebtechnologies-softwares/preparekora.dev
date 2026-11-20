"use strict";

(() => {

    const $ = (id) => document.getElementById(id);
    let isExporting = false;

    function showOverlay() {
        const o = $("exportOverlay"), b = $("exportProgressBar"), t = $("exportProgressText");
        if (o) o.hidden = false;
        if (b) b.style.width = "10%";
        if (t) t.textContent = "Rendering high-resolution image...";
    }

    function setProgress(pct, msg) {
        const b = $("exportProgressBar"), t = $("exportProgressText");
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
        return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
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
            scale, backgroundColor: "#ffffff", useCORS: true, logging: false,
            windowWidth: poster.scrollWidth, windowHeight: poster.scrollHeight
        });

        const mime = format === "webp" ? "image/webp" : "image/png";
        return { dataURL: canvas.toDataURL(mime, quality), format };
    }

    function getIdState() {
        return (window.PreparekoraEditor && window.PreparekoraEditor.getIdState)
            ? window.PreparekoraEditor.getIdState()
            : { current: "image" };
    }


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
            const st = $("previewStatus");
            if (st) st.textContent = "Image downloaded successfully.";

            if (window.PreparekoraEditor && window.PreparekoraEditor.incrementId) {
                window.PreparekoraEditor.incrementId();
            }
        } catch (err) {
            console.error("Export failed:", err);
            const st = $("previewStatus");
            if (st) st.textContent = "Export failed. Please try again.";
            alert("Export failed. Please try again.");
        } finally {
            setTimeout(hideOverlay, 500);
            isExporting = false;
        }
    }


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
            setProgress(10, "Rendering normal MCQ...");
            editor.setExplanation(false);
            await twoFrames();
            await new Promise(r => setTimeout(r, 150));
            const r1 = await renderPosterToDataURL();

            setProgress(50, "Rendering MCQ with explanation...");
            editor.setExplanation(true);
            await twoFrames();
            await new Promise(r => setTimeout(r, 150));
            const r2 = await renderPosterToDataURL();

            editor.setExplanation(originalState);
            await twoFrames();

            setProgress(92, "Downloading both variants...");

            const link1 = document.createElement("a");
            link1.href = r1.dataURL;
            link1.download = buildFilename(id, r1.format, "Q");
            const link2 = document.createElement("a");
            link2.href = r2.dataURL;
            link2.download = buildFilename(id, r2.format, "E");

            document.body.appendChild(link1);
            document.body.appendChild(link2);
            link1.click();
            link2.click();
            setTimeout(() => { link1.remove(); link2.remove(); }, 1000);

            setProgress(100, "Both downloaded.");
            const st = $("previewStatus");
            if (st) st.textContent = "Both variants downloaded.";

            if (editor.incrementId) editor.incrementId();
        } catch (err) {
            console.error("Both-export failed:", err);
            const st = $("previewStatus");
            if (st) st.textContent = "Export failed. Please try again.";
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
