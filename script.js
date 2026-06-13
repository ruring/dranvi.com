document.addEventListener('DOMContentLoaded', () => {
    const langToggleBtn = document.getElementById('lang-toggle');
    const koElements = document.querySelectorAll('[data-lang="ko"]');
    const enElements = document.querySelectorAll('[data-lang="en"]');
    
    // Simple state: 'ko' or 'en'
    let currentLang = 'en'; // Default fallback

    // Detect User Location / Language
    // If browser language starts with 'ko', set to 'ko'
    const userLang = navigator.language || navigator.userLanguage;
    if (userLang.startsWith('ko')) {
        currentLang = 'ko';
    }

    // Function to update UI
    const updateLanguage = (lang) => {
        if (lang === 'ko') {
            koElements.forEach(el => el.style.display = 'block');
            enElements.forEach(el => el.style.display = 'none');
            // Special handling for inline-block/flex if needed, but block is generally safe for this layout
            // For list items or specific layout bits, we might need adjustments, 
            // but given the structure <div data-lang="ko"> or <h2 data-lang="ko">, block is fine.
        } else {
            koElements.forEach(el => el.style.display = 'none');
            enElements.forEach(el => el.style.display = 'block');
        }
        currentLang = lang;
        langToggleBtn.textContent = lang === 'ko' ? 'EN' : 'KR'; 
        // Logic: Button says "EN" means "Switch to EN", or "Current is KO"?
        // Standard pattern: Button shows the OPTION to switch to.
        // If current is KO, show EN.
        // If current is EN, show KR.
    };

    // Initialize
    updateLanguage(currentLang);

    // Toggle Handler
    langToggleBtn.addEventListener('click', () => {
        const nextLang = currentLang === 'ko' ? 'en' : 'ko';
        updateLanguage(nextLang);
    });

    // Optional: Add simple scroll observer for fade-in elements
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                entry.target.classList.remove('fade-in-scroll'); // swap class
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in-scroll').forEach(el => {
        observer.observe(el);
    });

    // FAQ Accordion Toggle
    const faqCards = document.querySelectorAll('.faq-card');
    faqCards.forEach(card => {
        const toggleBtn = card.querySelector('.faq-toggle');
        const answer = card.querySelector('.faq-answer');
        const icon = card.querySelector('.faq-icon');

        if (toggleBtn && answer) {
            toggleBtn.addEventListener('click', () => {
                const isOpen = card.classList.contains('open');
                if (isOpen) {
                    card.classList.remove('open');
                    answer.style.maxHeight = null;
                    if (icon) icon.textContent = '+';
                } else {
                    card.classList.add('open');
                    answer.style.maxHeight = answer.scrollHeight + 'px';
                    if (icon) icon.textContent = '-';
                }
            });
        }
    });
});
