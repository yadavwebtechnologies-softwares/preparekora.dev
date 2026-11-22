(function (global) {
  'use strict';
  const DICT = {
    en: {
      sign_in: 'Sign in', email: 'Email', password: 'Password',
      admin: 'Admin', sign_out: 'Sign out',
      qa_image: 'Q&A Image', mcq_explanation: 'MCQ + Explanation',
      mcq_studio: 'MCQ Studio', mcq_paper: 'MCQ Paper Builder', thumbnail: 'Thumbnail Maker',
      subject: 'Subject', aspect_ratio: 'Aspect ratio', layout: 'Layout', theme: 'Theme',
      analyze_preview: 'Analyze & Preview images', back_edit: '← Back to edit',
      live_preview: 'Live preview', pages_generated: 'Pages generated',
      downloaded: 'downloaded', download: 'Download', downloaded_done: 'Downloaded',
      admin_settings: 'Admin settings', save: 'Save', saved: 'Saved', saving: 'Saving…',
      qr_destination: 'QR destination URL', loading: 'Loading…',
      paper_builder: 'MCQ Paper Builder', test_title: 'Test Title', exam_type: 'Exam Type',
      exam_name: 'Exam Name', qr_url: 'QR URL', paste_mcqs: 'Paste MCQs', create_pdf: 'Create PDF',
      test_ready: 'Test ready', thumbnail_maker: 'Thumbnail Maker',
      portrait: '9:16 Portrait', landscape: '16:9 Landscape', download_png: 'Download PNG', reset: 'Reset'
    },
    as: {
      sign_in: 'ছাইন ইন', email: 'ইমেইল', password: 'পাছৱৰ্ড',
      admin: 'প্ৰশাসক', sign_out: 'ছাইন আউট',
      qa_image: 'প্ৰশ্ন-উত্তৰ ছবি', mcq_explanation: 'বহুনিৰ্বাচন + ব্যাখ্যা',
      mcq_studio: 'বহুনিৰ্বাচন ষ্টুডিঅ', mcq_paper: 'বহুনিৰ্বাচন পত্ৰ নিৰ্মাতা', thumbnail: 'থাম্বনেইল নিৰ্মাতা',
      subject: 'বিষয়', aspect_ratio: 'অনুপাত', layout: 'বিন্যাস', theme: 'থীম',
      analyze_preview: 'বিশ্লেষণ আৰু পূৰ্বদৰ্শন', back_edit: '← সম্পাদনালৈ ঘূৰি যাওক',
      live_preview: 'লাইভ পূৰ্বদৰ্শন', pages_generated: 'পৃষ্ঠা সৃষ্টি হৈছে',
      downloaded: 'ডাউনলোড হৈছে', download: 'ডাউনলোড', downloaded_done: 'ডাউনলোড হৈছে',
      admin_settings: 'প্ৰশাসক ছেটিংছ', save: 'সংৰক্ষণ', saved: 'সংৰক্ষিত', saving: 'সংৰক্ষণ হৈ আছে…',
      qr_destination: 'QR গন্তব্য URL', loading: 'লোড হৈ আছে…',
      paper_builder: 'বহুনিৰ্বাচন পত্ৰ নিৰ্মাতা', test_title: 'পৰীক্ষাৰ শিৰোনাম', exam_type: 'পৰীক্ষাৰ প্ৰকাৰ',
      exam_name: 'পৰীক্ষাৰ নাম', qr_url: 'QR URL', paste_mcqs: 'বহুনিৰ্বাচন পেষ্ট কৰক', create_pdf: 'PDF সৃষ্টি কৰক',
      test_ready: 'পৰীক্ষা সাজু', thumbnail_maker: 'থাম্বনেইল নিৰ্মাতা',
      portrait: '৯:১৬ পট্ৰেইট', landscape: '১৬:৯ লেণ্ডস্কেপ', download_png: 'PNG ডাউনলোড', reset: 'ৰিছেট'
    }
  };

  const KEY = 'pk_lang';
  let current = (function () { try { return localStorage.getItem(KEY) || 'en'; } catch { return 'en'; } })();
  if (!DICT[current]) current = 'en';

  function t(key) { return (DICT[current] && DICT[current][key]) || DICT.en[key] || key; }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.placeholder) el.placeholder = t(k);
      } else {
        el.textContent = t(k);
      }
    });
  }

  function setLang(lang) {
    if (!DICT[lang]) return;
    current = lang;
    try { localStorage.setItem(KEY, lang); } catch {}
    apply();
    global.dispatchEvent(new CustomEvent('pk:langchanged', { detail: { lang } }));
  }

  global.PK_I18N = { t, apply, setLang, getLang: () => current, langs: Object.keys(DICT) };

  if (document.readyState !== 'loading') apply();
  else document.addEventListener('DOMContentLoaded', () => apply());
})(window);
