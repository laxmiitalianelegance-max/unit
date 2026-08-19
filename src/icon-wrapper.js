import app from "./theme.js";

const ICON_B64 = "UklGRv6L...";

function iconResponse(){
  const bin=atob(ICON_B64); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new Response(bytes,{headers:{"content-type":"image/webp","cache-control":"public, max-age=3600"}});
}

export default {
  async fetch(request, env, ctx){
    const url=new URL(request.url);
    if(url.pathname==="/icon-192.webp"||url.pathname==="/icon-512.webp"||url.pathname==="/icon.webp") return iconResponse();
    if(url.pathname==="/manifest.json") return new Response(JSON.stringify({name:"Unit",short_name:"Unit",start_url:"/app",display:"standalone",background_color:"#05070c",theme_color:"#05070c",icons:[{src:"/icon-192.webp?v=369",sizes:"192x192",type:"image/webp",purpose:"any maskable"},{src:"/icon-512.webp?v=369",sizes:"512x512",type:"image/webp",purpose:"any maskable"}]}),{headers:{"content-type":"application/manifest+json; charset=utf-8","cache-control":"no-cache"}});
    return app.fetch(request,env,ctx);
  }
};