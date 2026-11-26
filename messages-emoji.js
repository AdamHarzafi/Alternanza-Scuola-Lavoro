(function () {
    'use strict';
    const data = window.HarzafiEmojiData;
    if (!data || typeof Intl.Segmenter !== 'function') return;
    const segmenter = new Intl.Segmenter(undefined, {granularity:'grapheme'});
    const source = 'IMMAGINI/emoji-apple-16.webp', sheet = data.size, cell = data.cell;
    const key = value => [...value].map(c=>c.codePointAt(0).toString(16)).filter(c=>c!=='fe0f').join('-');
    const lookup = value => value.includes('\ufe0e') ? null : data.items[key(value)];
    function fragment(value) {
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
            glyph.append(art); result.append(glyph);
        }
        if (plain) result.append(document.createTextNode(plain));
        return result;
    }
    function render(element, value) { element.replaceChildren(fragment(String(value))); }
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
        function sync() {
            const style = getComputedStyle(input), present = [...segmenter.segment(input.value)].some(part=>lookup(part.segment));
            input.classList.toggle('has-emoji',present);
            surface.hidden = !present || input.hidden || !input.getClientRects().length;
            if (surface.hidden) return;
            for (const property of ['fontFamily','fontSize','fontWeight','fontStyle','fontStretch','fontVariant','fontVariantLigatures','fontFeatureSettings','fontVariationSettings','fontOpticalSizing','fontKerning','fontSizeAdjust','lineHeight','letterSpacing','wordSpacing','textAlign','textIndent','textTransform','textRendering','whiteSpace','wordBreak','overflowWrap','unicodeBidi','writingMode','paddingTop','paddingRight','paddingBottom','paddingLeft','tabSize','direction']) surface.style[property]=style[property];
            const inputRect=input.getBoundingClientRect(),parent=input.offsetParent,parentRect=parent.getBoundingClientRect(),parentStyle=getComputedStyle(parent);
            const borderBox=(styles,axis)=>parseFloat(styles[axis])+(styles.boxSizing==='border-box'?0:(axis==='width'?['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth']:['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth']).reduce((sum,key)=>sum+(parseFloat(styles[key])||0),0));
            const scaleX=parentRect.width/borderBox(parentStyle,'width')||1,scaleY=parentRect.height/borderBox(parentStyle,'height')||1;
            surface.style.left=((inputRect.left-parentRect.left)/scaleX-parent.clientLeft+parent.scrollLeft)+'px';surface.style.top=((inputRect.top-parentRect.top)/scaleY-parent.clientTop+parent.scrollTop)+'px';
            surface.style.width=(inputRect.width/scaleX-Math.max(0,input.offsetWidth-input.clientWidth))+'px';surface.style.height=(inputRect.height/scaleY)+'px';
            render(surface,input.value+'\u200b');
            // Keep the draft's real Unicode glyphs inline. Measuring their native
            // layout preserves the textarea's caret, wrapping, bidi and selection.
            const glyphs=[...surface.querySelectorAll('.apple-emoji')].map(glyph=>{
                glyph.classList.add('draft-emoji');const art=glyph.querySelector('.apple-emoji-art');art.remove();return {glyph,art};
            });
            surface.scrollTop=input.scrollTop;surface.scrollLeft=input.scrollLeft;
            const surfaceRect=surface.getBoundingClientRect(),size=parseFloat(style.fontSize)*1.18,artLayer=document.createDocumentFragment();
            const positions=glyphs.map(({glyph,art})=>{const range=document.createRange();range.selectNodeContents(glyph);return {art,rect:range.getBoundingClientRect()};});
            for(const {art,rect}of positions){
                Object.assign(art.style,{left:((rect.left-surfaceRect.left)/scaleX+surface.scrollLeft+(rect.width/scaleX-size)/2)+'px',top:((rect.top-surfaceRect.top)/scaleY+surface.scrollTop+(rect.height/scaleY-size)/2)+'px',width:size+'px',height:size+'px'});
                art.classList.add('draft-emoji-art');artLayer.append(art);
            }
            surface.append(artLayer);
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
