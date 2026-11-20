"use strict";

(() => {

    let activeModule = "mcq";
    const brandState = { name: "preparekora", domain: ".in" };

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
        "4:3":  { w: 1080, h: 1350 },
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
            panelDesc:  "Follow the steps to create your question and explanation image.",
            step1Title: "Paste your Q&A format",
            step1Desc:  "Paste the question and explanation in English and Assamese."
        }
    };

    const $ = (id) => document.getElementById(id);
    let fitTimer = null;

    function pad2(n) { return String(n).padStart(2, "0"); }
    function pad4(n) { return String(n).padStart(4, "0"); }

    function escapeHTML(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function scheduleFit() {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(fitPoster, 90);
    }


    /* ID system */

    function loadIdState() {
        const now = new Date().getMonth() + 1;
        let storedMonth = parseInt(localStorage.getItem("pk_id_month") || "0", 10);
        let counter = parseInt(localStorage.getItem("pk_id_counter") || "1", 10);

        if (storedMonth !== now) {
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
        const seqEl = $("currentIdSeq");
        if (seqEl) seqEl.textContent = pad4(counter);

        const idInput = $("mcqId");
        if (idInput) { idInput.value = idState.current; idInput.readOnly = !idState.manual; }

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
        const seqEl = $("currentIdSeq");
        if (seqEl) seqEl.textContent = pad4(idState.counter);
        renderPoster();
    }


    /* Parsers */

    function parseMCQ(text) {
        const r = {
            subjectEn: "", subjectAs: "",
            questionEn: "", questionAs: "",
            options: { A:{en:"",as:""}, B:{en:"",as:""}, C:{en:"",as:""}, D:{en:"",as:""} },
            answer: "", explanationEn: "", explanationAs: ""
        };

        text.split(/\r?\n/).forEach(line => {
            const t = line.trim();
            if (!t) return;
            let m;

            if ((m = t.match(/^Subject\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.subjectEn = m[1].trim();
            else if ((m = t.match(/^Subject\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.subjectAs = m[1].trim();
            else if ((m = t.match(/^Subject\s*[:：]\s*(.+)/i))) {
                const p = m[1].trim().split(/\s*[\/|]\s*/);
                r.subjectEn = p[0] || ""; r.subjectAs = p[1] || "";
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
            explanationEn: "", explanationAs: ""
        };

        text.split(/\r?\n/).forEach(line => {
            const t = line.trim();
            if (!t) return;
            let m;

            if ((m = t.match(/^Subject\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.subjectEn = m[1].trim();
            else if ((m = t.match(/^Subject\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.subjectAs = m[1].trim();
            else if ((m = t.match(/^Subject\s*[:：]\s*(.+)/i))) {
                const p = m[1].trim().split(/\s*[\/|]\s*/);
                r.subjectEn = p[0] || ""; r.subjectAs = p[1] || "";
            }
            else if ((m = t.match(/^Q\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.questionEn = m[1].trim();
            else if ((m = t.match(/^Q\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.questionAs = m[1].trim();
            else if ((m = t.match(/^Q\s*[:：]\s*(.+)/i))) r.questionEn = m[1].trim();
            else if ((m = t.match(/^Exp(?:lanation)?\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i))) r.explanationEn = m[1].trim();
            else if ((m = t.match(/^Exp(?:lanation)?\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i))) r.explanationAs = m[1].trim();
            else if ((m = t.match(/^Ans(?:wer)?\s*[-\/]?\s*EN\s*[:：]\s*(.+)/i)) && !r.explanationEn) r.explanationEn = m[1].trim();
            else if ((m = t.match(/^Ans(?:wer)?\s*[-\/]?\s*AS\s*[:：]\s*(.+)/i)) && !r.explanationAs) r.explanationAs = m[1].trim();
        });
        return r;
    }


    /* Builders */

    function buildHeaderHTML() {
        return `
            <header class="poster-header">
                <div class="poster-brand">
                    <span class="poster-brand-name">${escapeHTML(brandState.name)}</span><span class="poster-brand-domain">${escapeHTML(brandState.domain)}</span>
                </div>
                <div class="poster-id">${escapeHTML(idState.current)}</div>
            </header>
        `;
    }

    function buildFooterHTML(explanationHTML) {
        const hasExpl = !!explanationHTML;
        return `
            <footer class="poster-footer${hasExpl ? " poster-footer-with-explanation" : ""}">
                ${hasExpl ? explanationHTML : ""}
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

    /* ★ CHANGED — no divider between EN and AS question lines ★ */
    function buildQuestionHTML(en, as) {
        const parts = [];
        if (en) parts.push(`<span class="bilingual-line">${escapeHTML(en)}</span>`);
        if (as) parts.push(`<span class="bilingual-line">${escapeHTML(as)}</span>`);
        return parts.join("");
    }

    function buildExplanationHTML(en, as) {
        if (!en && !as) return "";
        return `
            <div class="poster-explanation">
                <div class="poster-explanation-title">Explanation</div>
                ${en ? `<div class="poster-explanation-text">${escapeHTML(en)}</div>` : ""}
                ${as ? `<div class="poster-explanation-text">${escapeHTML(as)}</div>` : ""}
            </div>
        `;
    }

    function buildMCQPosterHTML(d, includeExplanation) {
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

        const explHTML = includeExplanation
            ? buildExplanationHTML(d.explanationEn, d.explanationAs)
            : "";

        const ctaHTML = includeExplanation
            ? ""
            : `<div class="poster-cta">💬 Comment your answer</div>`;

        return `
            ${buildHeaderHTML()}
            <section class="poster-content">
                <div class="poster-question-area">
                    ${buildSubjectHTML(d.subjectEn, d.subjectAs)}
                    <h1 class="poster-question">${buildQuestionHTML(d.questionEn, d.questionAs)}</h1>
                    <div class="poster-options">${optHTML}</div>
                    <div class="poster-comments">
                        <span class="poster-comments-title">Answer:</span>
                        <span class="poster-comments-text">${escapeHTML(answerText)}</span>
                    </div>
                    ${ctaHTML}
                </div>
            </section>
            ${buildFooterHTML(explHTML)}
        `;
    }

    function buildQAPosterHTML(d) {
        return `
            ${buildHeaderHTML()}
            <section class="poster-content">
                <div class="poster-question-area">
                    ${buildSubjectHTML(d.subjectEn, d.subjectAs)}
                    <h1 class="poster-question">${buildQuestionHTML(d.questionEn, d.questionAs)}</h1>
                    ${buildExplanationHTML(d.explanationEn, d.explanationAs)}
                </div>
            </section>
            ${buildFooterHTML("")}
        `;
    }


    /* Render */

    function renderPoster() {
        const poster = $("poster");
        if (!poster) { console.warn("Poster element missing"); return; }

        if (activeModule === "mcq") {
            const text = $("mcqContent") ? $("mcqContent").value : "";
            const data = parseMCQ(text);
            const includeExpl = $("mcqIncludeExplanation") ? $("mcqIncludeExplanation").checked : false;
            poster.className = "poster poster-bilingual";
            poster.innerHTML = buildMCQPosterHTML(data, includeExpl);
            syncHiddenFields(data, "mcq");
        } else {
            const text = $("qaContent") ? $("qaContent").value : "";
            const data = parseQA(text);
            poster.className = "poster poster-qa";
            poster.innerHTML = buildQAPosterHTML(data);
            syncHiddenFields(data, "qa");
        }

        applyPosterDimensions();
        initQR();
        updateExportInfo();
        scheduleFit();
    }

    function syncHiddenFields(d, mode) {
        const set = (id, v) => { const el = $(id); if (el) el.value = v; };

        if (mode === "mcq") {
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
            set("optionA", ""); set("optionB", ""); set("optionC", ""); set("optionD", "");
            set("commentsText", d.explanationEn || d.explanationAs || "");
        }
    }


    /* Dimensions */

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


    /* Auto-fit */

    function fitPoster() {
        const poster = $("poster");
        if (!poster) return;
        const content = poster.querySelector(".poster-content");
        const area = content ? content.querySelector(".poster-question-area") : null;
        if (!content || !area) return;

        poster.style.setProperty("--fit-scale", "1");
        void area.offsetHeight;

        const minScale = 0.50, maxScale = 1.35, step = 0.02;
        let scale = 1, safety = 0;

        let avail = content.clientHeight;
        let used = area.offsetHeight;
        while (used > avail && scale > minScale && safety < 45) {
            scale -= step;
            poster.style.setProperty("--fit-scale", scale.toFixed(3));
            void area.offsetHeight;
            used = area.offsetHeight;
            avail = content.clientHeight;
            safety++;
        }

        const header = poster.querySelector(".poster-header");
        const footer = poster.querySelector(".poster-footer");
        const inner = poster.clientHeight - 60;
        while (scale > minScale && safety < 80) {
            const hH = header ? header.offsetHeight : 0;
            const cH = content.offsetHeight;
            const fH = footer ? footer.offsetHeight : 0;
            if (hH + cH + fH <= inner) break;
            scale -= step;
            poster.style.setProperty("--fit-scale", scale.toFixed(3));
            void area.offsetHeight;
            safety++;
        }

        if (scale === 1) {
            let grow = 0;
            while (used < avail * 0.62 && scale < maxScale && grow < 30) {
                scale += step;
                poster.style.setProperty("--fit-scale", scale.toFixed(3));
                void area.offsetHeight;
                used = area.offsetHeight;
                avail = content.clientHeight;
                grow++;
            }
        }
    }


    /* QR */

    function initQR() {
        const el = $("previewQrCode");
        if (!el) return;
        el.innerHTML = "";
        const url = ($("qrUrl") && $("qrUrl").value.trim()) || "https://preparekora.in";
        if (window.QRCode) {
            try {
                new QRCode(el, {
                    text: url, width: 54, height: 54,
                    colorDark: "#252525", colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch (err) { console.warn("QR init failed", err); }
        }
    }


    /* Export info */

    function updateExportInfo() {
        const ratio = $("aspectRatio").value;
        let dims;
        if (ratio === "custom") {
            dims = { w: parseInt($("customWidth").value, 10) || 1080, h: parseInt($("customHeight").value, 10) || 1350 };
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


    /* Module switch */

    function setModule(mod) {
        if (mod !== "mcq" && mod !== "qa") return;
        activeModule = mod;

        document.querySelectorAll(".module-tab").forEach(tab => {
            const on = tab.dataset.module === mod;
            tab.classList.toggle("active", on);
            tab.setAttribute("aria-selected", on ? "true" : "false");
        });

        const mcqFG = $("mcqFieldGroup");
        const qaFG  = $("qaFieldGroup");
        if (mcqFG) mcqFG.hidden = mod !== "mcq";
        if (qaFG)  qaFG.hidden  = mod !== "qa";

        const toggleGroup = $("mcqOutputToggleGroup");
        if (toggleGroup) toggleGroup.hidden = mod !== "mcq";

        const bothBtn = $("exportBothButton");
        if (bothBtn) {
            if (mod === "mcq") {
                bothBtn.hidden = false;
                const expBtn = $("exportButton");
                bothBtn.disabled = expBtn ? expBtn.disabled : true;
            } else {
                bothBtn.hidden = true;
            }
        }

        const meta = moduleMeta[mod];
        const t = $("panelHeadingTitle"), d = $("panelHeadingDesc");
        const s1t = $("step1Title"), s1d = $("step1Desc");
        if (t) t.textContent = meta.panelTitle;
        if (d) d.textContent = meta.panelDesc;
        if (s1t) s1t.textContent = meta.step1Title;
        if (s1d) s1d.textContent = meta.step1Desc;

        renderPoster();
        updateSaveStatus("Ready");
    }

    function updateSaveStatus(msg) {
        const el = $("saveStatus");
        if (el) el.textContent = msg || "Ready";
    }


    /* Events */

    function bindEvents() {
        ["mcqContent", "qaContent"].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener("input", () => {
                renderPoster();
                updateSaveStatus("Editing…");
            });
        });

        const ratio = $("aspectRatio");
        if (ratio) ratio.addEventListener("change", () => {
            const cf = $("customSizeFields");
            if (cf) cf.hidden = ratio.value !== "custom";
            renderPoster();
        });

        ["customWidth", "customHeight"].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener("input", () => renderPoster());
        });

        const qrUrl = $("qrUrl");
        if (qrUrl) qrUrl.addEventListener("input", () => { initQR(); scheduleFit(); });

        const explToggle = $("mcqIncludeExplanation");
        if (explToggle) explToggle.addEventListener("change", () => {
            renderPoster();
            updateSaveStatus("Ready");
        });

        const previewBtn = $("previewButton");
        if (previewBtn) previewBtn.addEventListener("click", () => {
            renderPoster();
            const resSel = $("exportResolution");
            const expBtn = $("exportButton");
            const bothBtn = $("exportBothButton");
            if (resSel) resSel.disabled = false;
            if (expBtn) expBtn.disabled = false;
            if (bothBtn && activeModule === "mcq") bothBtn.disabled = false;
            const st = $("previewStatus");
            if (st) st.textContent = "Preview updated.";
            const est = $("exportStatus");
            if (est) est.textContent = "Ready to download.";
            updateSaveStatus("Ready");
        });

        const res = $("exportResolution");
        if (res) res.addEventListener("change", updateExportInfo);

        const fmt = $("exportFormat");
        if (fmt) fmt.addEventListener("change", () => {
            const qf = $("qualityField");
            if (qf) qf.hidden = fmt.value !== "webp";
            updateExportInfo();
        });

        const quality = $("exportQuality");
        if (quality) quality.addEventListener("input", () => {
            const v = $("qualityValue");
            if (v) v.textContent = quality.value + "%";
        });

        const manualToggle = $("manualIdToggle");
        if (manualToggle) manualToggle.addEventListener("change", () => {
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

        const idInput = $("mcqId");
        if (idInput) idInput.addEventListener("input", () => {
            if (!idState.manual) return;
            idState.current = idInput.value.trim() || idState.current;
            renderPoster();
        });

        const panelHeading = $("panelHeading");
        if (panelHeading) {
            const switchToMcq = () => setModule("mcq");
            panelHeading.addEventListener("click", switchToMcq);
            panelHeading.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    switchToMcq();
                }
            });
        }

        window.addEventListener("resize", scheduleFit);
    }


    /* Init */

    function init() {
        loadIdState();
        bindEvents();
        setModule("mcq");
        const explToggle = $("mcqIncludeExplanation");
        if (explToggle) explToggle.checked = false;
        renderPoster();
        updateExportInfo();
        updateSaveStatus("Ready");
        console.log("Preparekora editor ready.");
    }

    window.PreparekoraEditor = {
        setModule, updateSaveStatus, renderPoster, fitPoster, incrementId,
        getIdState: () => ({ ...idState }),
        isExplanationOn: () => {
            const t = $("mcqIncludeExplanation");
            return t ? t.checked : false;
        },
        setExplanation: (on) => {
            const t = $("mcqIncludeExplanation");
            if (t) { t.checked = !!on; renderPoster(); }
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

})();
