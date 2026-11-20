"use strict";

(() => {

    const $ = (id) => document.getElementById(id);

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
                setTimeout(() => {
                    if (window.PreparekoraEditor && window.PreparekoraEditor.setModule) {
                        window.PreparekoraEditor.setModule(mod);
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
        console.log("Preparekora MCQ Studio initialized.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeApplication, { once: true });
    } else {
        initializeApplication();
    }

})();
