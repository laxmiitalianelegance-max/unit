import app from "./router.js";

const UNIT_THEME = String.raw`
<style id="unit-blue-theme">
:root{
  --bg:#06080d!important;
  --surface:#0d1119!important;
  --surface-2:#121824!important;
  --line:#253044!important;
  --line-soft:#182131!important;
  --gold:#2da8ff!important;
  --gold-dim:#1677c8!important;
  --ink:#f5f8fc!important;
  --ink-dim:#a8b4c6!important;
  --ink-faint:#66748a!important;
  --sage:#54d6ff!important;
  --brick:#ff667a!important;
}
html{background:#06080d!important}
body{
  background:
    radial-gradient(900px 500px at 70% -5%,rgba(30,146,255,.18),transparent 60%),
    radial-gradient(500px 350px at -10% 35%,rgba(0,210,255,.08),transparent 65%),
    linear-gradient(180deg,#080b11 0%,#05070b 100%)!important;
  color:#f5f8fc!important;
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  min-height:100vh;
}
header{
  padding:28px 20px 20px!important;
  max-width:560px;
  margin:0 auto;
}
header:before{
  content:"U1";
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:44px;height:44px;
  margin-bottom:14px;
  border-radius:14px;
  background:linear-gradient(145deg,#1cc8ff 0%,#1688ff 48%,#0d47b8 100%);
  color:white;
  font-weight:800;
  font-size:17px;
  letter-spacing:-1px;
  box-shadow:0 0 0 1px rgba(116,205,255,.4),0 12px 35px rgba(0,126,255,.28),inset 0 1px rgba(255,255,255,.35);
}
header:after{
  border:0!important;
  height:1px;
  background:linear-gradient(90deg,rgba(50,170,255,.65),rgba(50,170,255,0))!important;
  margin-top:20px!important;
}
h1{
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  font-size:32px!important;
  font-weight:750!important;
  letter-spacing:-1.2px!important;
  color:#fff!important;
  text-shadow:0 0 28px rgba(55,169,255,.18);
}
p.sub{font-size:13px!important;color:#8290a4!important;letter-spacing:.01em}
.page{padding:20px!important}
.keys,.promptbox,.panel{
  background:linear-gradient(180deg,rgba(17,23,34,.96),rgba(10,14,22,.96))!important;
  border:1px solid rgba(95,132,178,.24)!important;
  border-radius:16px!important;
  box-shadow:0 10px 32px rgba(0,0,0,.22),inset 0 1px rgba(255,255,255,.025)!important;
}
.keys{padding:15px!important}
label{
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  color:#718197!important;
  font-size:10px!important;
  font-weight:700!important;
  letter-spacing:.13em!important;
}
input,textarea{
  background:#080c13!important;
  color:#f4f8ff!important;
  border:1px solid #202c3e!important;
  border-radius:11px!important;
  padding:13px 14px!important;
  transition:border-color .18s ease,box-shadow .18s ease,background .18s ease!important;
}
input::placeholder,textarea::placeholder{color:#526076!important}
input:focus,textarea:focus{
  border-color:#249cff!important;
  box-shadow:0 0 0 3px rgba(32,151,255,.12),0 0 24px rgba(0,144,255,.08)!important;
  background:#0a1019!important;
}
.toggle-keys{color:#5dafff!important;font-weight:600!important;cursor:pointer}
.modes{
  gap:7px!important;
  padding:5px!important;
  border:1px solid #202b3b!important;
  border-radius:14px!important;
  background:#090d14!important;
  overflow:visible!important;
}
.mode{
  border:0!important;
  border-radius:10px!important;
  background:transparent!important;
  color:#69778a!important;
  padding:11px 7px!important;
  font-weight:650!important;
  transition:.18s ease!important;
}
.mode.active{
  color:#eef8ff!important;
  background:linear-gradient(180deg,#183554,#10243b)!important;
  box-shadow:inset 0 0 0 1px rgba(62,173,255,.3),0 4px 16px rgba(0,111,255,.12)!important;
}
.promptbox{padding:14px!important}
.promptbox textarea{min-height:92px!important;background:transparent!important;border:0!important;box-shadow:none!important;padding:5px!important}
.sendrow{border-top:1px solid #1a2433!important;padding-top:12px!important}
.sendbtn,button.primary{
  border:0!important;
  border-radius:11px!important;
  background:linear-gradient(135deg,#35c5ff 0%,#198cff 55%,#1467e7 100%)!important;
  color:white!important;
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  font-weight:750!important;
  letter-spacing:.04em!important;
  box-shadow:0 8px 24px rgba(0,124,255,.28),inset 0 1px rgba(255,255,255,.3)!important;
}
.sendbtn{padding:10px 22px!important}
button.primary{padding:15px!important}
.sendbtn:active,button.primary:active{transform:translateY(1px)}
.panel{overflow:hidden!important}
.panel-head{
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  font-weight:750!important;
  border-bottom:1px solid #1a2433!important;
  background:rgba(255,255,255,.012)!important;
}
.panel-body{color:#dfe7f2!important}
.panel-body.loading{color:#75849a!important}
.dot{border-radius:50%!important;transform:none!important;box-shadow:0 0 12px currentColor!important}
#pStatus.ok{color:#53d5ff!important}
nav.bottomnav{
  background:rgba(7,10,16,.94)!important;
  border-top:1px solid rgba(71,101,139,.28)!important;
  backdrop-filter:blur(18px)!important;
  -webkit-backdrop-filter:blur(18px)!important;
  box-shadow:0 -10px 35px rgba(0,0,0,.25)!important;
}
nav.bottomnav .navitem{
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  font-size:11px!important;
  font-weight:650!important;
  color:#59677a!important;
  border-top:2px solid transparent!important;
  padding:14px 4px 12px!important;
}
nav.bottomnav .navitem.active{
  color:#55c7ff!important;
  border-top-color:#2da8ff!important;
  text-shadow:0 0 16px rgba(45,168,255,.45)!important;
}
@media(min-width:520px){
  .page,header{max-width:620px}
  .keys,.promptbox,.panel{border-radius:18px!important}
}
</style>`;

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/html")) {
        const html = await response.text();
        const themed = html
          .replace('<meta name="theme-color" content="#17130f">','<meta name="theme-color" content="#06080d">')
          .replace("</head>", UNIT_THEME + "</head>");
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(themed, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }
    }

    return response;
  }
};
