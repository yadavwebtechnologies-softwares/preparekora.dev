"use strict";

/* =========================================
   Preparekora MCQ Studio
   Editor Controller (Bilingual MCQ + Q&A)
========================================= */

(() => {

    /* =====================================
       State
    ===================================== */

    let activeModule = "mcq";

    const brandState = {
        name: "preparekora",
        domain: ".in"
    };

    const idState = {
        current: "PR/11/0001",
        month: new Date().getMonth() + 1,
        counter: 1,
        manual: false
    };

    const ratioMap = {
        "1:1":  { w: 1080, h: 1080 },
        "16:9": { w: 1920, h: 1080 },
        "9:16": { w: 1080, h: 1920 },
        "4:3":  { w: 1080, h: 1350 },   // preserve original default
        "3:4":  { w: 1080, h: 1440 }
    };

    const moduleMeta = {
        mcq: {
            panelTitle: "Create MCQ image",
            panelDesc:  "Follow the steps to create your question image.",
            step1Title: "Paste your MCQ format",
            step1Desc:  "Paste the complete bilingual question with four options, answer, and explanation."
        },
        qa: {
            panelTitle: "Create Q&A image",
            panelDesc:  "Follow the steps to create your Q&A image.",
            step1Title: "Paste your Q&A format",
            step1Desc:  "Paste the question and answer in English and Assamese."
        }
    };

    const $ = (id) => document.getElementById(id);

    let fitTimer = null;


    /* =====================================
       Helpers
    ===================================== */

    function pad2(n) { return String(n).padStart(2, "0"); }
    function pad4(n) { return String(n).padStart(4, "0"); }

    function escapeHTML(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function scheduleFit() {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(fitPoster, 90);
    }


    /* =====================================
       ID management (PR/MM/NNNN)
    ===================================== */

    function loadIdState() {
        const now = new Date().getMonth() + 1;
        let storedMonth = parseInt(localStorage.getItem("pk_id_month") || "0", 10);
        let counter = parseInt(localStorage.getItem("pk_id_counter") || "1", 10);

        if (storedMonth !== now) {
            storedMonth = now;
            counter = 1;
            localStorage.setItem("pk_id_month", String(now));
            localStorage.setItem("pk_id_counter", "1");
        }

        idState.month = now;
        idState.counter = counter;
        idState.manual = localStorage.getItem("pk_id_manual") === "1";
        idState.current = "PR/" + pad2(now) + "/" + pad4(counter);

        const monthEl = $("currentIdMonth");
        if (monthEl) monthEl.textContent = pad2(now);

        const idInput = $("mcqId");
        if (idInput) {
            idInput.value = idState.current;
            idInput.readOnly = !idState.manual;
        }

        const manualStatus = $("manualIdStatus");
        if (manualStatus) {
            manualStatus.textContent = idState.manual
                ? "Manual editing is enabled. Modify the ID carefully."
                : "Manual editing is disabled. Image ID is automatically managed.";
        }

        const toggle = $("manualIdToggle");
        if (toggle) toggle.checked = idState.manual;
    }

    function incrementId() {
        if (idState.manual) return;
        idState.counter = idState.counter >= 9999 ? 1 : idState.counter + 1;
        localStorage.setItem("pk_id_counter", String(idState.counter));
        idState.current = "PR/" + pad2(idState.month) + "/" + pad4(idState.counter);
        const idInput = $("mcqId");
        if (idInput) idInput.value = idState.current;
        renderPoster();
    }


    /* =====================================
       Parsers
    ===================================== */

    function parseMCQ(text) {
        const r = {
            subjectEn: "", subjectAs: "",
            questionEn: "", questionAs: "",
            options: { A: {en:"",as:""}, B: {en:"",as:""}, C: {en:"",as:""}, D: {en:"",as:""} },
            answer: "", explanationEn: "", explanationAs: ""
        };

        text.split(/\r?\n/).forEach(line => {
            const t = line.trim();
            if (!t) return;
            let m;

            if ((m = t.match(/^Subject\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.subjectEn = m[1].trim();
            else if ((m = t.match(/^Subject\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.subjectAs = m[1].trim();
            else if ((m = t.match(/^Subject\s*[:：]\s*(.+)/i))) {
                const parts = m[1].trim().split(/\s*[\/|]\s*/);
                r.subjectEn = parts[0] || "";
                r.subjectAs = parts[1] || "";
            }
            else if ((m = t.match(/^Q\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.questionEn = m[1].trim();
            else if ((m = t.match(/^Q\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.questionAs = m[1].trim();
            else if ((m = t.match(/^Q\s*[:：]\s*(.+)/i))) r.questionEn = m[1].trim();
            else if ((m = t.match(/^Exp(?:lanation)?\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.explanationEn = m[1].trim();
            else if ((m = t.match(/^Exp(?:lanation)?\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.explanationAs = m[1].trim();
            else if ((m = t.match(/^Ans(?:wer)?\s*[:：]\s*([A-D])\b/i))) r.answer = m[1].toUpperCase();
            else if ((m = t.match(/^([A-D])\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.options[m[1].toUpperCase()].en = m[2].trim();
            else if ((m = t.match(/^([A-D])\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.options[m[1].toUpperCase()].as = m[2].trim();
            else if ((m = t.match(/^([A-D])\s*[):]\s*(.+)/i))) r.options[m[1].toUpperCase()].en = m[2].trim();
        });

        return r;
    }

    function parseQA(text) {
        const r = {
            subjectEn: "", subjectAs: "",
            questionEn: "", questionAs: "",
            answerEn: "", answerAs: ""
        };

        text.split(/\r?\n/).forEach(line => {
            const t = line.trim();
            if (!t) return;
            let m;

            if ((m = t.match(/^Subject\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.subjectEn = m[1].trim();
            else if ((m = t.match(/^Subject\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.subjectAs = m[1].trim();
            else if ((m = t.match(/^Subject\s*[:：]\s*(.+)/i))) {
                const parts = m[1].trim().split(/\s*[\/|]\s*/);
                r.subjectEn = parts[0] || "";
                r.subjectAs = parts[1] || "";
            }
            else if ((m = t.match(/^Q\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.questionEn = m[1].trim();
            else if ((m = t.match(/^Q\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.questionAs = m[1].trim();
            else if ((m = t.match(/^Q\s*[:：]\s*(.+)/i))) r.questionEn = m[1].trim();
            else if ((m = t.match(/^Ans(?:wer)?\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.answerEn = m[1].trim();
            else if ((m = t.match(/^Ans(?:wer)?\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.answerAs = m[1].trim();
            else if ((m = t.match(/^Ans(?:wer)?\s*[:：]\s*(.+)/i))) r.answerEn = m[1].trim();
        });

        return r;
    }


    /* =====================================
       Poster HTML builders
    ===================================== */

    function buildHeaderHTML() {
        return `
            <header class="poster-header">
                <div class="poster-brand">
                    <span class="poster-brand-name" id="previewBrandName">${escapeHTML(brandState.name)}</span><span class="poster-brand-domain" id="previewBrandDomain">${escapeHTML(brandState.domain)}</span>
                </div>
                <div class="poster-id" id="previewMcqId">${escapeHTML(idState.current)}</div>
            </header>
        `;
    }

    function buildFooterHTML() {
        return `
            <footer class="poster-footer">
                <div class="poster-qr-container"><div id="previewQrCode"></div></div>
            </footer>
        `;
    }

    function buildSubjectHTML(en, as) {
        if (!en && !as) return "";
        const parts = [];
        if (en) parts.push(escapeHTML(en));
        if (en && as) parts.push('<span class="subject-sep">/</span>');
        if (as) parts.push(escapeHTML(as));
        return `<div class="poster-subject">${parts.join(" ")}</div>`;
    }

    function buildQuestionHTML(en, as) {
        const parts = [];
        if (en) parts.push(`<span class="bilingual-line">${escapeHTML(en)}</span>`);
        if (en && as) parts.push(`<span class="bilingual-divider"></span>`);
        if (as) parts.push(`<span class="bilingual-line">${escapeHTML(as)}</span>`);
        return parts.join("");
    }

    function buildMCQPosterHTML(d) {
        const optHTML = ["A","B","C","D"].map(letter => {
            const o = d.options[letter];
            return `
                <div class="poster-option">
                    <div class="poster-option-head">
                        <span class="poster-option-letter">${letter}</span>
                        <span class="poster-option-text">${escapeHTML(o.en)}</span>
                    </div>
                    ${o.as ? `<span class="poster-option-text opt-as">${escapeHTML(o.as)}</span>` : ""}
                </div>
            `;
        }).join("");

        const aLetter = d.answer || "";
        const aObj = d.options[aLetter] || { en: "", as: "" };
        let answerText = "—";
        if (aLetter) {
            answerText = aLetter + ") " + (aObj.en || "");
            if (aObj.as) answerText += " / " + aObj.as;
        }

        const explHTML = (d.explanationEn || d.explanationAs) ? `
            <div class="poster-explanation">
                <div class="poster-explanation-title">Explanation</div>
                ${d.explanationEn ? `<div class="poster-explanation-text">${escapeHTML(d.explanationEn)}</div>` : ""}
                ${d.explanationAs ? `<div class="poster-explanation-text">${escapeHTML(d.explanationAs)}</div>` : ""}
            </div>
        ` : "";

        return `
            ${buildHeaderHTML()}
            <section class="poster-content">
                <div class="poster-question-area">
                    ${buildSubjectHTML(d.subjectEn, d.subjectAs)}
                    <h1 class="poster-question" id="previewQuestion">${buildQuestionHTML(d.questionEn, d.questionAs)}</h1>
                    <div class="poster-options">${optHTML}</div>
                    <div class="poster-comments">
                        <span class="poster-comments-title">Answer:</span>
                        <span class="poster-comments-text" id="previewCommentsText">${escapeHTML(answerText)}</span>
                    </div>
                    ${explHTML}
                </div>
            </section>
            ${buildFooterHTML()}
        `;
    }

    function buildQAPosterHTML(d) {
        const answerHTML = (d.answerEn || d.answerAs) ? `
            <div class="poster-answer-box">
                <div class="poster-answer-label">Answer</div>
                ${d.answerEn ? `<div class="poster-answer-text">${escapeHTML(d.answerEn)}</div>` : ""}
                ${d.answerAs ? `<div class="poster-answer-text">${escapeHTML(d.answerAs)}</div>` : ""}
            </div>
        ` : "";

        return `
            ${buildHeaderHTML()}
            <section class="poster-content">
                <div class="poster-question-area">
                    ${buildSubjectHTML(d.subjectEn, d.subjectAs)}
                    <h1 class="poster-question" id="previewQuestion">${buildQuestionHTML(d.questionEn, d.questionAs)}</h1>
                    ${answerHTML}
                </div>
            </section>
            ${buildFooterHTML()}
        `;
    }


    /* =====================================
       Render poster
    ===================================== */

    function renderPoster() {
        const poster = $("poster");
        if (!poster) return;

        const text = activeModule === "mcq"
            ? ($("mcqContent") ? $("mcqContent").value : "")
            : ($("qaContent") ? $("qaContent").value : "");

        if (activeModule === "mcq") {
            const data = parseMCQ(text);
            poster.className = "poster poster-bilingual";
            poster.innerHTML = buildMCQPosterHTML(data);
            syncHiddenFields(data);
        } else {
            const data = parseQA(text);
            poster.className = "poster poster-qa";
            poster.innerHTML = buildQAPosterHTML(data);
            syncHiddenFields(data);
        }

        applyPosterDimensions();
        initQR();
        updateExportInfo();
        scheduleFit();
    }


    /* =====================================
       Sync hidden compat fields
    ===================================== */

    function syncHiddenFields(d) {
        const set = (id, v) => { const el = $(id); if (el) el.value = v; };

        if (activeModule === "mcq") {
            set("subjectName", d.subjectEn || d.subjectAs);
            set("questionText", d.questionEn || d.questionAs);
            set("optionA", d.options.A.en || d.options.A.as);
            set("optionB", d.options.B.en || d.options.B.as);
            set("optionC", d.options.C.en || d.options.C.as);
            set("optionD", d.options.D.en || d.options.D.as);
            set("commentsText", d.explanationEn || d.explanationAs || "");
        } else {
            set("subjectName", d.subjectEn || d.subjectAs);
            set("questionText", d.questionEn || d.questionAs);
            set("optionA", "");
            set("optionB", "");
            set("optionC", "");
            set("optionD", "");
            set("commentsText", d.answerEn || d.answerAs);
        }
    }


    /* =====================================
       Poster dimensions
    ===================================== */

    function applyPosterDimensions() {
        const poster = $("poster");
        if (!poster) return;

        const ratio = $("aspectRatio") ? $("aspectRatio").value : "4:3";
        let dims;

        if (ratio === "custom") {
            const w = parseInt($("customWidth").value, 10) || 1080;
            const h = parseInt($("customHeight").value, 10) || 1350;
            dims = { w, h };
        } else {
            dims = ratioMap[ratio] || ratioMap["4:3"];
        }

        const pw = Math.round(dims.w / 2);
        const ph = Math.round(dims.h / 2);

        poster.style.width = pw + "px";
        poster.style.height = ph + "px";
        poster.style.setProperty("--poster-scale", (pw / 540).toFixed(3));

        const dimEl = $("canvasDimensions");
        if (dimEl) dimEl.textContent = dims.w + " × " + dims.h + " px";

        const ratioEl = $("canvasRatioLabel");
        if (ratioEl) ratioEl.textContent = ratio + " aspect ratio";

        const previewSize = $("previewSize");
        if (previewSize) previewSize.textContent = dims.w + " × " + dims.h;

        const previewAspect = $("previewAspectLabel");
        if (previewAspect) previewAspect.textContent = ratio;
    }


    /* =====================================
       Fit poster dynamically
    ===================================== */

    function fitPoster() {
        const poster = $("poster");
        if (!poster) return;
        const content = poster.querySelector(".poster-content");
        const area = content ? content.querySelector(".poster-question-area") : null;
        if (!content || !area) return;

        poster.style.setProperty("--fit-scale", "1");
        void area.offsetHeight;

        const avail = content.clientHeight;
        let used = area.offsetHeight;
        let scale = 1;
        const minScale = 0.55;
        const maxScale = 1.30;
        const step = 0.02;
        let safety = 0;

        while (used > avail && scale > minScale && safety < 40) {
            scale -= step;
            poster.style.setProperty("--fit-scale", scale.toFixed(3));
            void area.offsetHeight;
            used = area.offsetHeight;
            safety++;
        }

        if (scale === 1) {
            let grow = 0;
            while (used < avail * 0.62 && scale < maxScale && grow < 25) {
                scale += step;
                poster.style.setProperty("--fit-scale", scale.toFixed(3));
                void area.offsetHeight;
                used = area.offsetHeight;
                grow++;
            }
        }
    }


    /* =====================================
       QR
    ===================================== */

    function initQR() {
        const el = $("previewQrCode");
        if (!el) return;
        el.innerHTML = "";

        const url = ($("qrUrl") && $("qrUrl").value.trim()) || "https://preparekora.in";

        if (window.QRCode) {
            try {
                new QRCode(el, {
                    text: url,
                    width: 54,
                    height: 54,
                    colorDark: "#252525",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch (err) {
                console.warn("QR init failed", err);
            }
        }
    }


    /* =====================================
       Export info
    ===================================== */

    function updateExportInfo() {
        const ratio = $("aspectRatio").value;
        let dims;
        if (ratio === "custom") {
            dims = {
                w: parseInt($("customWidth").value, 10) || 1080,
                h: parseInt($("customHeight").value, 10) || 1350
            };
        } else {
            dims = ratioMap[ratio] || ratioMap["4:3"];
        }

        const res = parseInt($("exportResolution").value, 10) || 4;
        const dimEl = $("exportDimensions");
        if (dimEl) dimEl.textContent = (dims.w * res) + " × " + (dims.h * res) + " px";

        const fmt = ($("exportFormat").value || "png").toUpperCase();
        const fmtEl = $("exportFormatLabel");
        if (fmtEl) fmtEl.textContent = fmt;
    }


    /* =====================================
       Module switching
    ===================================== */

    function setModule(mod) {
        if (mod !== "mcq" && mod !== "qa") return;
        activeModule = mod;

        // Tabs
        document.querySelectorAll(".module-tab").forEach(tab => {
            const on = tab.dataset.module === mod;
            tab.classList.toggle("active", on);
            tab.setAttribute("aria-selected", on ? "true" : "false");
        });

        // Field groups
        const mcqFG = $("mcqFieldGroup");
        const qaFG  = $("qaFieldGroup");
        if (mcqFG) mcqFG.hidden = mod !== "mcq";
        if (qaFG)  qaFG.hidden  = mod !== "qa";

        // Heading texts
        const meta = moduleMeta[mod];
        const title = $("panelHeadingTitle");
        const desc  = $("panelHeadingDesc");
        const s1t   = $("step1Title");
        const s1d   = $("step1Desc");
        if (title) title.textContent = meta.panelTitle;
        if (desc)  desc.textContent  = meta.panelDesc;
        if (s1t)   s1t.textContent   = meta.step1Title;
        if (s1d)   s1d.textContent   = meta.step1Desc;

        renderPoster();
        updateSaveStatus("Ready");
    }


    /* =====================================
       Save status
    ===================================== */

    function updateSaveStatus(msg) {
        const el = $("saveStatus");
        if (el) el.textContent = msg || "Ready";
    }


    /* =====================================
       Events
    ===================================== */

    function bindEvents() {
        // Live input on active module
        ["mcqContent", "qaContent"].forEach(id => {
            const el = $(id);
            if (el) {
                el.addEventListener("input", () => {
                    renderPoster();
                    updateSaveStatus("Editing…");
                });
            }
        });

        // Ratio
        const ratio = $("aspectRatio");
        if (ratio) {
            ratio.addEventListener("change", () => {
                const customFields = $("customSizeFields");
                if (customFields) customFields.hidden = ratio.value !== "custom";
                renderPoster();
            });
        }

        ["customWidth", "customHeight"].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener("input", () => renderPoster());
        });

        // QR
        const qrUrl = $("qrUrl");
        if (qrUrl) {
            qrUrl.addEventListener("input", () => {
                initQR();
                scheduleFit();
            });
        }

        // Preview button
        const previewBtn = $("previewButton");
        if (previewBtn) {
            previewBtn.addEventListener("click", () => {
                renderPoster();
                const resSel = $("exportResolution");
                const expBtn = $("exportButton");
                if (resSel) resSel.disabled = false;
                if (expBtn) expBtn.disabled = false;
                const st = $("previewStatus");
                if (st) st.textContent = "Preview updated.";
                const est = $("exportStatus");
                if (est) est.textContent = "Ready to download.";
                updateSaveStatus("Ready");
            });
        }

        // Resolution
        const res = $("exportResolution");
        if (res) res.addEventListener("change", updateExportInfo);

        // Format
        const fmt = $("exportFormat");
        if (fmt) {
            fmt.addEventListener("change", () => {
                const qf = $("qualityField");
                if (qf) qf.hidden = fmt.value !== "webp";
                updateExportInfo();
            });
        }

        // Quality slider
        const quality = $("exportQuality");
        if (quality) {
            quality.addEventListener("input", () => {
                const val = $("qualityValue");
                if (val) val.textContent = quality.value + "%";
            });
        }

        // Manual ID toggle
        const manualToggle = $("manualIdToggle");
        if (manualToggle) {
            manualToggle.addEventListener("change", () => {
                idState.manual = manualToggle.checked;
                localStorage.setItem("pk_id_manual", idState.manual ? "1" : "0");
                const idInput = $("mcqId");
                if (idInput) idInput.readOnly = !idState.manual;
                const status = $("manualIdStatus");
                if (status) {
                    status.textContent = idState.manual
                        ? "Manual editing is enabled. Modify the ID carefully."
                        : "Manual editing is disabled. Image ID is automatically managed.";
                }
            });
        }

        const idInput = $("mcqId");
        if (idInput) {
            idInput.addEventListener("input", () => {
                if (!idState.manual) return;
                idState.current = idInput.value.trim() || idState.current;
                renderPoster();
            });
        }

        // Download compat button
        const dl = $("downloadButton");
        if (dl) {
            dl.addEventListener("click", () => {
                const btn = $("exportButton");
                if (btn) btn.click();
            });
        }

        // Resize
        window.addEventListener("resize", scheduleFit);
    }


    /* =====================================
       Init
    ===================================== */

    function init() {
        loadIdState();
        bindEvents();
        setModule("mcq");
        updateExportInfo();
        updateSaveStatus("Ready");
        console.log("Preparekora editor ready (bilingual).");
    }

    // Public API
    window.PreparekoraEditor = {
        setModule,
        updateSaveStatus,
        renderPoster,
        fitPoster,
        incrementId,
        getIdState: () => ({ ...idState })
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

})();
