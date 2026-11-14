export type Prefs={theme:'auto'|'dark'|'light';compact:boolean;auto:boolean}
const def:Prefs={theme:'auto',compact:false,auto:true}
export const apply=(p:Prefs)=>{const r=document.documentElement;if(p.theme==='auto')r.removeAttribute('data-theme');else r.dataset.theme=p.theme;r.classList.toggle('compact',p.compact)}
export const getPrefs=():Prefs=>{try{return{...def,...JSON.parse(localStorage.getItem('prefs')||'{}')}}catch{return def}}
export const setPrefs=(p:Prefs)=>{try{localStorage.setItem('prefs',JSON.stringify(p))}catch{/* ignore */}apply(p)}
