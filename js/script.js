"use strict";

(() => {

    const $ = (id) => document.getElementById(id);

    /* Module tabs — event delegation for robustness */

    function initializeModuleTabs() {
        const tabsContainer = $("moduleTabs");
        const target = tabsContainer || document;

        target.addEventListener("click", (e) => {
            const tab = e.target.closest(".module-tab");
            if (!tab) return;
            const mod = tab.dataset.module;
            if (!mod) return;

            if (window.PreparekoraEditor && window.PreparekoraEditor.setModule) {
                window.PreparekoraEditor.setModule(mod);
            } else {
                // Retry once if editor not ready
                setTimeout(() => {
                    if (window.PreparekoraEditor && window.PreparekoraEditor.setModule) {
                        window.PreparekoraEditor.setModule(mod);
                    } else {
                        console.warn("Editor module API not available");
                    }
                }, 120);
            }
        });
    }

    function updateApplicationStatus() {
        const editor = window.PreparekoraEditor;
        if (editor && editor.updateSaveStatus) editor.updateSaveStatus("Ready");
    }

    function initializeApplication() {
        initializeModuleTabs();
        updateApplicationStatus();

        // Safety net: if editor init already ran, ensure a render happens
        setTimeout(() => {
            if (window.PreparekoraEditor && !$("poster").querySelector(".poster-option")) {
                try { window.PreparekoraEditor.renderPoster(); } catch (e) { console.warn(e); }
            }
        }, 250);

        console.log("Preparekora MCQ Studio initialized.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeApplication, { once: true });
    } else {
        initializeApplication();
    }

})();
