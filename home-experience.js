(() => {
    const section = document.querySelector('.pathway-details');
    const productStage = document.querySelector('.pathway-product-stage');
    if (!section && !productStage) return;

    const privacyCard = document.querySelector('.pathway-detail-card--verified');
    const privacyWords = [...(privacyCard?.querySelectorAll('.pathway-privacy-word') || [])];
    const targets = [
        productStage,
        document.querySelector('.pathway-detail-card--progress'),
        document.querySelector('.pathway-detail-card--current'),
        privacyCard
    ].filter(Boolean);
    const motionRoot = document.querySelector('.home-content-flow') || document.body;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const randomCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$%';
    const textMeasureContext = document.createElement('canvas').getContext('2d');
    let privacySequenceId = 0;

    const revealAll = () => {
        targets.forEach(target => target.classList.add('is-motion-visible'));
    };

    const resetPrivacySequence = () => {
        privacyWords.forEach(word => {
            word.classList.remove('is-word-active', 'is-word-resolved');
            const measured = word.querySelector('.pathway-privacy-word__measure')?.textContent || '';
            const text = word.querySelector('.pathway-privacy-word__text');
            if (text) {
                text.textContent = measured;
                text.style.removeProperty('--scramble-scale');
            }
        });
    };

    const preparePrivacyDots = () => {
        privacyWords.forEach(word => {
            const measured = word.querySelector('.pathway-privacy-word__measure')?.textContent || '';
            const dots = word.querySelector('.pathway-privacy-word__dots');
            if (!dots) return;

            const letterCount = Array.from(measured).filter(character => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(character)).length;
            dots.replaceChildren(...Array.from({ length: letterCount }, () => {
                const dot = document.createElement('span');
                dot.className = 'pathway-privacy-dot';
                return dot;
            }));
        });
    };

    const stopPrivacySequence = disable => {
        privacySequenceId += 1;
        resetPrivacySequence();
        if (disable) privacyCard?.classList.remove('pathway-privacy-sequence-ready');
    };

    const pause = duration => new Promise(resolve => window.setTimeout(resolve, duration));

    const randomizeWord = (word, progress) => {
        const characters = Array.from(word);
        const letterIndexes = characters
            .map((character, index) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(character) ? index : -1)
            .filter(index => index >= 0);
        const lockedCount = Math.floor(letterIndexes.length * progress);
        const lockedIndexes = new Set(letterIndexes.slice(0, lockedCount));

        return characters.map((character, index) => {
            if (!letterIndexes.includes(index) || lockedIndexes.has(index)) return character;
            let randomCharacter = randomCharacters[Math.floor(Math.random() * randomCharacters.length)];
            if (randomCharacter.toLowerCase() === character.toLowerCase()) {
                randomCharacter = randomCharacters[(randomCharacters.indexOf(randomCharacter) + 7) % randomCharacters.length];
            }
            return randomCharacter;
        }).join('');
    };

    const setScrambledText = (text, value, metrics) => {
        text.textContent = value;
        if (!textMeasureContext || !metrics.width) return;

        textMeasureContext.font = metrics.font;
        const characters = Array.from(value).length;
        const naturalWidth = textMeasureContext.measureText(value).width + Math.max(0, characters - 1) * metrics.letterSpacing;
        const fitScale = Math.min(1, metrics.width * .96 / Math.max(1, naturalWidth));
        text.style.setProperty('--scramble-scale', fitScale.toFixed(3));
    };

    const playPrivacySequence = async () => {
        if (!privacyCard || !privacyWords.length) return;
        const sequenceId = ++privacySequenceId;
        resetPrivacySequence();

        // Let “privacy” come into focus before the other words begin to resolve.
        await pause(960);
        if (sequenceId !== privacySequenceId || !privacyCard.classList.contains('is-motion-visible')) return;

        const wordsToReveal = privacyWords.filter(word => !word.classList.contains('pathway-privacy-word--focus'));
        for (const word of wordsToReveal) {
            if (sequenceId !== privacySequenceId || !privacyCard.classList.contains('is-motion-visible')) return;

            const measured = word.querySelector('.pathway-privacy-word__measure')?.textContent || '';
            const text = word.querySelector('.pathway-privacy-word__text');
            if (!text) continue;

            const textStyle = window.getComputedStyle(text);
            const metrics = {
                width: word.getBoundingClientRect().width,
                font: textStyle.font,
                letterSpacing: Number.parseFloat(textStyle.letterSpacing) || 0
            };

            setScrambledText(text, randomizeWord(measured, 0), metrics);
            word.classList.add('is-word-active');

            const frames = 6;
            for (let frame = 1; frame <= frames; frame += 1) {
                await pause(28);
                if (sequenceId !== privacySequenceId || !privacyCard.classList.contains('is-motion-visible')) return;
                setScrambledText(text, randomizeWord(measured, frame / frames), metrics);
            }

            text.textContent = measured;
            text.style.setProperty('--scramble-scale', '1');
            word.classList.remove('is-word-active');
            word.classList.add('is-word-resolved');
            await pause(24);
        }
    };

    motionRoot.classList.add('pathway-motion-ready');

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
        revealAll();
        return;
    }

    if (privacyCard && privacyWords.length) {
        resetPrivacySequence();
        preparePrivacyDots();
        privacyCard.classList.add('pathway-privacy-sequence-ready');
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const target = entry.target;
            const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
            const isVisible = entry.isIntersecting && entry.intersectionRatio >= .16;

            if (isVisible) {
                const entersFromTop = entry.boundingClientRect.top < viewportHeight * .2;
                target.classList.remove('motion-exit-top', 'motion-exit-bottom');
                target.classList.toggle('motion-from-top', entersFromTop);
                target.classList.toggle('motion-from-bottom', !entersFromTop);
                target.classList.add('is-motion-visible');
                if (target === privacyCard) playPrivacySequence();
                return;
            }

            const exitsAbove = entry.boundingClientRect.top < viewportHeight * .5;
            target.classList.remove('motion-from-top', 'motion-from-bottom', 'is-motion-visible');
            target.classList.toggle('motion-exit-top', exitsAbove);
            target.classList.toggle('motion-exit-bottom', !exitsAbove);
            if (target === privacyCard) stopPrivacySequence(false);
        });
    }, {
        rootMargin: '0px',
        threshold: [0, .16]
    });

    targets.forEach(target => observer.observe(target));

    reducedMotion.addEventListener('change', event => {
        if (!event.matches) return;
        observer.disconnect();
        stopPrivacySequence(true);
        revealAll();
    });
})();
