(function () {
    'use strict';
    const data = window.HarzafiEmojiData;
    if (!data || typeof Intl.Segmenter !== 'function') return;
    const segmenter = new Intl.Segmenter(undefined, {granularity:'grapheme'});
    const source = 'IMMAGINI/emoji-apple-16.webp', sheet = data.size, cell = data.cell;
    const key = value => [...value].map(c=>c.codePointAt(0).toString(16)).filter(c=>c!=='fe0f').join('-');
    const lookup = value => value.includes('\ufe0e') ? null : data.items[key(value)];
    function fragment(value, measure) {
        const result = document.createDocumentFragment();
        let plain = '';
        for (const {segment} of segmenter.segment(value)) {
            const position = lookup(segment);
            if (!position) { plain += segment; continue; }
            if (plain) {result.append(document.createTextNode(plain));plain='';}
            const glyph = document.createElement('span'); glyph.className = 'apple-emoji';
            glyph.append(document.createTextNode(segment));
            const art = document.createElement('span'); art.className = 'apple-emoji-art'; art.setAttribute('aria-hidden','true');
            // The transparent one-pixel gutter is excluded from the displayed cell.
            const scale = 1.18 / cell;
            art.style.setProperty('--emoji-sheet-size', `${sheet[0]*scale}em ${sheet[1]*scale}em`);
            art.style.setProperty('--emoji-position', `${-(position[0]*(cell+2)+1)*scale}em ${-(position[1]*(cell+2)+1)*scale}em`);
            if (measure) {
                const width = measure(segment); glyph.style.width = width+'px';
                art.style.width = '1.18em'; art.style.left = '50%'; art.style.transform = 'translateX(-50%)';
            }
            glyph.append(art); result.append(glyph);
        }
        if (plain) result.append(document.createTextNode(plain));
        return result;
    }
    function render(element, value, measure) { element.replaceChildren(fragment(String(value),measure)); }
    function enhance(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const texts = []; let current;
        while ((current=walker.nextNode())) if (!current.parentElement?.closest('.apple-emoji,textarea,input,script,style,.composer-emoji-mirror')
            && [...segmenter.segment(current.data)].some(part=>lookup(part.segment))) texts.push(current);
        for (const text of texts) text.replaceWith(fragment(text.data));
    }
    const image = new Image();
    image.onload = ()=>document.documentElement.classList.add('emoji-ready');
    image.src = source;
    function mirror(input) {
        const surface = document.createElement('div'); surface.className = 'composer-emoji-mirror'; surface.setAttribute('aria-hidden','true');
        input.before(surface);
        const context = document.createElement('canvas').getContext('2d');
        function sync() {
            const style = getComputedStyle(input), present = [...segmenter.segment(input.value)].some(part=>lookup(part.segment));
            input.classList.toggle('has-emoji',present);
            surface.hidden = !present || input.hidden;
            if (surface.hidden) return;
            for (const property of ['fontFamily','fontSize','fontWeight','fontStyle','fontStretch','lineHeight','letterSpacing','textAlign','textIndent','paddingTop','paddingRight','paddingBottom','paddingLeft','tabSize','direction']) surface.style[property]=style[property];
            surface.style.left=input.offsetLeft+'px';surface.style.top=input.offsetTop+'px';
            surface.style.width=input.getBoundingClientRect().width+'px';surface.style.height=input.getBoundingClientRect().height+'px';
            context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            render(surface,input.value+'\u200b',value=>context.measureText(value).width+(parseFloat(style.letterSpacing)||0));
            surface.scrollTop=input.scrollTop;surface.scrollLeft=input.scrollLeft;
        }
        input.addEventListener('input',sync);
        input.addEventListener('scroll',()=>{surface.scrollTop=input.scrollTop;surface.scrollLeft=input.scrollLeft;},{passive:true});
        new ResizeObserver(sync).observe(input);
        document.fonts?.ready.then(sync);
        return sync;
    }
    const observer = new MutationObserver(records=>{
        for(const record of records) {
            if(record.type==='characterData') {
                const parent=record.target.parentElement;
                if(parent&&!parent.closest('.apple-emoji,.composer-emoji-mirror,textarea'))enhance(parent);
            } else for(const added of record.addedNodes) {
                if(added.nodeType===1&&!added.closest('.apple-emoji,.composer-emoji-mirror,textarea,script,style'))enhance(added);
                else if(added.nodeType===3&&added.parentElement&&!added.parentElement.closest('.apple-emoji,.composer-emoji-mirror,textarea,script,style'))enhance(added.parentElement);
            }
        }
    });
    window.HarzafiEmoji = {render,enhance,mirror};
    enhance(document.body); observer.observe(document.body,{childList:true,subtree:true,characterData:true});
})();
