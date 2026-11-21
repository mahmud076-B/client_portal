/** Inline, pre-paint: hides reveal targets until the observer is live. */
export const motionBootScript = `(function(){try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.classList.add('gx-motion');setTimeout(function(){d.classList.remove('gx-motion')},2500);}catch(e){}})();`;
